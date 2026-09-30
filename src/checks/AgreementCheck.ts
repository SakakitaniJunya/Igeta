// agreement-check: 最後に承認された版から、何が変わったかを検査する。既定 OFF。
// Spec: docs/explanation/08-agreement-ledger.md §4
//
// 出すもの:
//   (a) 章の本文が承認した版から変わった            → 再合意が要る (違反)
//   (b) 由来が指す正本が承認した版から変わった
//       - reagreementRules (kind + 節) に当たる     → 再合意が要る (違反)
//       - 当たらない                                 → 通知のみ (警告)
// 承認された版が無い台帳は違反にしない (まだ合意が無い状態は正当)。台帳が 1 つも無ければ Ok。

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { AgreementExportEvent } from '../core/AgreementLedger.js';
import { LEDGER_FILENAME, readLedger } from '../core/AgreementLedger.js';
import type { Check, CheckContext } from '../core/Check.js';
import { computeFingerprint } from '../core/Fingerprint.js';
import type { ReagreementRule } from '../core/IgetaConfig.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';
import type { SourceDoc, SourceIndex } from '../core/SourceResolver.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { UnclosedAutogenError } from '../export/MarkdownStrip.js';
import { chapterFingerprint } from '../generators/AgreementRecordModule.js';

export interface AgreementCheckOptions {
  readonly docsDir?: string;
  /** 提出物のディレクトリ (台帳のあるディレクトリ)。省略なら docsDir 内の台帳を全部見る */
  readonly submissionDir?: string;
  readonly configPath?: string;
}

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage']);
const H2_RE = /^##\s+(.*?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const LEADING_NUMBER_RE = /^\d+(\.\d+)*\.?\s+/;

function findLedgerDirs(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      if (entry.name === LEDGER_FILENAME) found.push(dirname(full));
    }
  };
  walk(dir);
  return found;
}

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
    const violations: Violation[] = [];
    for (const dir of dirs) violations.push(...this.#checkOne(ctx.targetRoot, dir, rules, sourceIndex));
    return violations;
  }

  #checkOne(targetRoot: string, dir: string, rules: readonly ReagreementRule[], sourceIndex: SourceIndex | null): Violation[] {
    const relDir = relative(targetRoot, dir) || '.';
    const ledger = readLedger(dir);
    if (ledger.kind === 'invalid') return [ledger.violation];
    if (ledger.kind === 'absent') {
      return [{ severity: 'cannot-check', message: `合意台帳が無い: ${relDir}` }];
    }

    let approvedVersion: string | null = null;
    for (const event of ledger.events) if (event.event === 'approve') approvedVersion = event.targetVersion;
    if (approvedVersion === null) {
      this.#warnings.push(`${relDir}: 承認された版がまだ無い (検査する基準が無い)`);
      return [];
    }
    const baseline = ledger.events.find((e): e is AgreementExportEvent => e.event === 'export' && e.version === approvedVersion);
    if (baseline === undefined) {
      return [{ severity: 'cannot-check', message: `${relDir}: 承認された版 ${approvedVersion} の提出の記録が台帳に無い` }];
    }

    const violations: Violation[] = [];
    for (const chapter of baseline.chapters) {
      const absPath = join(dir, chapter.file);
      const relPath = relative(targetRoot, absPath);
      if (!existsSync(absPath)) {
        violations.push({ severity: 'violation', file: relPath, message: `再合意が要る: 承認した版 ${approvedVersion} にあった章が無い` });
        continue;
      }
      try {
        const current = chapterFingerprint(readFileSync(absPath, 'utf8'), relPath, baseline.omitSections);
        if (current !== chapter.chapterFingerprint) {
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
        const resolution = sourceIndex === null ? { kind: 'missing' as const } : resolveSource(sourceIndex, source.from);
        if (resolution.kind === 'missing') {
          violations.push({
            severity: 'violation',
            file: relPath,
            message: `再合意が要る: 承認した版 ${approvedVersion} の由来が指す正本が無くなった (${source.from})`,
          });
          continue;
        }
        if (computeFingerprint(resolution.text) === source.fingerprint) continue;
        const where = `${source.from} (${resolution.doc.relPath}:${resolution.line})`;
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
