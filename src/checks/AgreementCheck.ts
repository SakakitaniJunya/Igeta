// agreement-check: 最後に承認された版から、何が変わったかを検査する。既定 OFF。
// Spec: docs/explanation/08-agreement-ledger.md §4
//
// 出すもの:
//   (a) 章の本文が承認した版から変わった            → 再合意が要る (違反)
//   (b) 由来が指す正本が承認した版から変わった
//       - reagreementRules (kind + 節) に当たる     → 再合意が要る (違反)
//       - 当たらない                                 → 通知のみ (警告)
// 承認された版が無い台帳は違反にしない (まだ合意が無い状態は正当)。台帳が 1 つも無ければ Ok。
//
// 指紋は基準の行 (export) が持つ正規化の版で計算して比べる (版の違いだけで再合意を出さない)。
// 一致 = 保存値と同じ、または直近の fingerprint-rebase がその保存値に対応づけた値と同じ (ADR-0007)。
// 由来の from は、基準より後の source-move の対応を通して今の from に直してから解決する (ADR-0006 決定 7)。

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  CHAPTER_FINGERPRINT_TARGET,
  exportNormalizationVersion,
  findBaseline,
  findLedgerDirs,
  followRedirect,
  matchesRecorded,
  readLedger,
  rebaseKey,
  rebaseTable,
  sourceRedirects,
} from '../core/AgreementLedger.js';
import type { Check, CheckContext } from '../core/Check.js';
import { computeFingerprint, isImplementedNormalizationVersion } from '../core/Fingerprint.js';
import type { ReagreementRule } from '../core/IgetaConfig.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { LinkTable } from '../core/LinkTable.js';
import { buildLinkTable } from '../core/LinkTable.js';
import type { Violation } from '../core/Report.js';
import type { SourceDoc, SourceIndex } from '../core/SourceResolver.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { isPathWithinRealDir } from '../export/Manifest.js';
import { UnclosedAutogenError } from '../export/MarkdownStrip.js';
import { chapterFingerprint } from '../generators/AgreementRecordModule.js';

export interface AgreementCheckOptions {
  readonly docsDir?: string;
  /** 提出物のディレクトリ (台帳のあるディレクトリ)。省略なら docsDir 内の台帳を全部見る */
  readonly submissionDir?: string;
  readonly configPath?: string;
}

const H2_RE = /^##\s+(.*?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const LEADING_NUMBER_RE = /^\d+(\.\d+)*\.?\s+/;

/** 正本の `line` (1 始まり) が属する H2 見出し。H2 より前なら null。 */
function sectionHeadingAt(doc: SourceDoc, line: number): string | null {
  let heading: string | null = null;
  let inFence = false;
  for (let i = doc.bodyStart; i < doc.lines.length && i < line; i += 1) {
    const text = doc.lines[i] ?? '';
    if (FENCE_RE.test(text)) inFence = !inFence;
    if (inFence) continue;
    const matched = H2_RE.exec(text);
    if (matched !== null) heading = (matched[1] ?? '').trim();
  }
  return heading;
}

const stripNumber = (heading: string): string => heading.replace(LEADING_NUMBER_RE, '');

function matchesRule(rules: readonly ReagreementRule[], doc: SourceDoc, heading: string | null): boolean {
  return rules.some((rule) => {
    if (rule.kind !== doc.kind) return false;
    if (rule.section === undefined) return true;
    if (heading === null) return false;
    return rule.section === heading || stripNumber(rule.section) === stripNumber(heading);
  });
}

export class AgreementCheck implements Check {
  readonly name = 'agreement-check';
  readonly #options: AgreementCheckOptions;
  #warnings: string[] = [];

  constructor(options: AgreementCheckOptions = {}) {
    this.#options = options;
  }

  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    this.#warnings = [];
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');

    const loaded = loadIgetaConfig(ctx.targetRoot, this.#options.configPath);
    if ('violation' in loaded) return [loaded.violation];
    const rules = loaded.config.reagreementRules;

    let dirs: readonly string[];
    if (this.#options.submissionDir !== undefined) {
      const dir = this.#options.submissionDir;
      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return [{ severity: 'cannot-check', message: `提出物のディレクトリが無い: ${dir}` }];
      }
      dirs = [dir];
    } else {
      dirs = existsSync(docsDir) && statSync(docsDir).isDirectory() ? findLedgerDirs(docsDir) : [];
    }
    if (dirs.length === 0) return []; // 台帳が 1 つも無い既存案件は赤くしない

    const sourceIndex = buildSourceIndex(ctx.targetRoot, docsDir);
    const links = buildLinkTable(ctx.targetRoot, sourceIndex);
    const violations: Violation[] = [];
    for (const dir of dirs) violations.push(...this.#checkOne(ctx.targetRoot, dir, rules, sourceIndex, links));
    return violations;
  }

  #checkOne(targetRoot: string, dir: string, rules: readonly ReagreementRule[], sourceIndex: SourceIndex | null, links: LinkTable): Violation[] {
    const relDir = relative(targetRoot, dir) || '.';
    const ledger = readLedger(dir);
    if (ledger.kind === 'invalid') return [ledger.violation];
    if (ledger.kind === 'absent') {
      return [{ severity: 'cannot-check', message: `合意台帳が無い: ${relDir}` }];
    }

    // 基準は「承認済みの版のうち、提出の記録が最も後の版」(findBaseline)。
    const found = findBaseline(ledger.events);
    if (found.kind === 'none') {
      this.#warnings.push(`${relDir}: 承認された版がまだ無い (検査する基準が無い)`);
      return [];
    }
    if (found.kind === 'export-missing') {
      return [{ severity: 'cannot-check', message: `${relDir}: 承認された版 (${found.versions.join(', ')}) の提出の記録が台帳に無い` }];
    }
    const baseline = found.event;
    const approvedVersion = baseline.version;
    const storedVersion = exportNormalizationVersion(baseline);
    if (!isImplementedNormalizationVersion(storedVersion)) {
      return [
        {
          severity: 'cannot-check',
          message: `${relDir}: 承認した版 ${approvedVersion} の指紋は正規化の版 ${storedVersion} で計算されていて、確かめられない (この Igeta より新しい版で記録された台帳か)`,
        },
      ];
    }
    // 基準より後に追記された、中身を変えない操作の記録。基準より前の行は、基準の行の値に効かない
    const redirects = sourceRedirects(ledger.events, found.index);
    const rebased = rebaseTable(ledger.events, found.index);

    const unverifiableRebaseMessage = `${relDir}: fingerprint-rebase の対応表の正規化の版が確かめられない (この Igeta より新しい版で記録された台帳か)`;
    const violations: Violation[] = [];
    for (const chapter of baseline.chapters) {
      const absPath = join(dir, chapter.file);
      const relPath = relative(targetRoot, absPath);
      if (!existsSync(absPath)) {
        violations.push({ severity: 'violation', file: relPath, message: `再合意が要る: 承認した版 ${approvedVersion} にあった章が無い` });
        continue;
      }
      // lexical には収まるが実体が外を指す symlink を弾く (ledger parse は lexical 検査まで。
      // 記録の正当性は manifest が realpath で担保しているので、ここは改ざん・後付け symlink 対策)。
      if (!isPathWithinRealDir(realpathSync(dir), absPath)) {
        violations.push({ severity: 'cannot-check', file: relPath, message: `章の実体が提出物のディレクトリの外を指している: ${chapter.file}` });
        continue;
      }
      try {
        const content = readFileSync(absPath, 'utf8');
        const rewriteChapter = links.rewriterFor(relPath);
        const matched = matchesRecorded(
          chapter.chapterFingerprint,
          storedVersion,
          (version) => chapterFingerprint(content, relPath, baseline.omitSections, version, rewriteChapter),
          rebased.get(rebaseKey(chapter.file, CHAPTER_FINGERPRINT_TARGET, chapter.chapterFingerprint)),
        );
        if (matched === 'unverifiable') {
          violations.push({ severity: 'cannot-check', file: relPath, message: unverifiableRebaseMessage });
        } else if (!matched) {
          violations.push({
            severity: 'violation',
            file: relPath,
            message: `再合意が要る: 章の本文が承認した版 ${approvedVersion} から変わった (新しい版を提出して承認を取る)`,
          });
        }
      } catch (error) {
        if (!(error instanceof UnclosedAutogenError)) throw error;
        violations.push({ severity: 'cannot-check', message: error.message });
      }

      for (const source of chapter.sources) {
        const from = followRedirect(redirects, source.from);
        const fromLabel = from === source.from ? source.from : `${source.from} → ${from}`;
        const resolution = sourceIndex === null ? { kind: 'missing' as const } : resolveSource(sourceIndex, from);
        if (resolution.kind === 'missing') {
          violations.push({
            severity: 'violation',
            file: relPath,
            message: `再合意が要る: 承認した版 ${approvedVersion} の由来が指す正本が無くなった (${fromLabel})`,
          });
          continue;
        }
        const rewriteSource = links.rewriterFor(resolution.doc.relPath);
        const matched = matchesRecorded(
          source.fingerprint,
          storedVersion,
          (version) => computeFingerprint(resolution.text, version, rewriteSource),
          rebased.get(rebaseKey(chapter.file, source.from, source.fingerprint)),
        );
        if (matched === 'unverifiable') {
          violations.push({ severity: 'cannot-check', file: relPath, message: unverifiableRebaseMessage });
          continue;
        }
        if (matched) continue;
        const where = `${fromLabel} (${resolution.doc.relPath}:${resolution.line})`;
        if (matchesRule(rules, resolution.doc, sectionHeadingAt(resolution.doc, resolution.line))) {
          violations.push({
            severity: 'violation',
            file: relPath,
            message: `再合意が要る: 承認した版 ${approvedVersion} の後に正本が変わった ${where}`,
          });
        } else {
          this.#warnings.push(`${relPath}: 通知のみ: 承認した版 ${approvedVersion} の後に正本が変わった ${where}`);
        }
      }
    }
    return violations;
  }
}
