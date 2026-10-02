// provenance-check: 由来の鮮度を検査する。既定 OFF。
// Spec: docs/explanation/04-provenance-and-agreement.md §5、05-coverage-and-learning.md §8 手順 3
//
// 状態の判定順 (設計に優先順位の明文はないため実装で決めた。判定できない状態を先に切り、
// 「なぜその状態か」が 1 つに決まるようにする):
//   1. orphan               … anchor が今の章に無い (節が消えた/名前が変わった)
//   2. source-missing       … from が今の正本で解決できない (from ありのときだけ)
//   3. pending               … acceptedBy が無い
//   4. self-approved        … acceptedBy が capturedBy と同じ
//   5. open-stated-as-final … from の正本が未決なのに、章が確定を主張している (from ありのときだけ)
//   6. stale / orphan-content … 保存した版 (normalizationVersion) で計算した指紋が今の内容と違う
//                              (from の有無で呼び分ける)。版が古いというだけでは stale にしない
//   7. needs-recompute      … 保存した版の実装が無く確かめられない、または保存した版では一致するが
//                              今の版と違う (igeta fingerprint-rebase で載せ替える)
//   8. ok
//
// 「章が確定を主張している」は章 (delivery-chapter) 自身の frontmatter status。「正本が未決」は
// 正本の文書の status が確定でない、または正本の行に OPEN-nnn がある、のどちらか (設計書の
// 条件が曖まいなため実装できる最小の形にして明記した。04-provenance-and-agreement.md に追記)。

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { normalizeActor } from '../core/ActorName.js';
import { findDeliveryChapters, extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import type { DeliveryBlock } from '../core/DeliveryBlocks.js';
import type { DestinationRewriter } from '../core/Fingerprint.js';
import { CURRENT_NORMALIZATION_VERSION, matchStoredFingerprint } from '../core/Fingerprint.js';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import type { LinkTable } from '../core/LinkTable.js';
import { buildLinkTable } from '../core/LinkTable.js';
import { readSidecar } from '../core/ProvenanceSidecar.js';
import type { ProvenanceEntry } from '../core/ProvenanceSidecar.js';
import type { SourceIndex } from '../core/SourceResolver.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import type { Violation } from '../core/Report.js';

export type ProvenanceState =
  | 'ok'
  | 'pending'
  | 'stale'
  | 'orphan'
  | 'orphan-content'
  | 'self-approved'
  | 'source-missing'
  | 'needs-recompute'
  | 'open-stated-as-final';

/** status: fixed (確定) を名乗っているとみなす値。DocTemplateCheck.ts の FINAL_STATUSES と同じ語彙。 */
const FINAL_STATUSES = new Set(['fixed', 'accepted']);
const OPEN_REF_RE = /OPEN-\d{3}(?!\d)(?!-\d)/;

export interface EntryEvaluation {
  readonly anchor: string;
  readonly state: ProvenanceState;
  /** stale のとき、少なくとも正本のファイル:行 (どこを直すかを探す作業を減らすため) */
  readonly detail?: string;
}

/**
 * 正本が未決かどうか。status が無い (未設定) 場合も未決に含める — 「確定していると明示していない」
 * ことと「未決」を区別しない (status: fixed/accepted を明示していない限り未決扱いにする。
 * code-reviewer round 1 blocker 2、旧実装は status が無いとこの条件が素通りしていた)。
 */
function isSourceUnresolved(resolution: ReturnType<typeof resolveSource>): boolean {
  if (resolution.kind === 'missing') return true;
  return resolution.doc.status === null || !FINAL_STATUSES.has(resolution.doc.status) || OPEN_REF_RE.test(resolution.text);
}

/**
 * 保存した指紋を、保存した版で計算し直して比べる。版の違いだけでは stale にしない (一致して版が古いだけなら
 * needs-recompute)。保存した版の実装が無ければ確かめられないので needs-recompute (一致とみなさない)。
 */
function judgeFingerprint(
  stored: string,
  version: number,
  text: string,
  rewrite: DestinationRewriter,
): 'ok' | 'changed' | { readonly needsRecompute: string } {
  const match = matchStoredFingerprint(stored, version, text, rewrite);
  if (match === 'unverifiable') return { needsRecompute: `版 ${version} の実装が無く確かめられない。provenance-capture で取り直す` };
  if (match === 'mismatch') return 'changed';
  if (version !== CURRENT_NORMALIZATION_VERSION) {
    return { needsRecompute: `版 ${version} で一致 (今は版 ${CURRENT_NORMALIZATION_VERSION})。igeta fingerprint-rebase で載せ替える` };
  }
  return 'ok';
}

function evaluateEntry(
  entry: ProvenanceEntry,
  blocks: readonly DeliveryBlock[],
  chapterStatus: string | null,
  sourceIndex: SourceIndex | null,
  links: LinkTable,
  chapterRelPath: string,
): EntryEvaluation {
  const block = blocks.find((b) => b.anchor === entry.anchor);
  if (block === undefined) return { anchor: entry.anchor, state: 'orphan' };

  if (entry.from !== null) {
    const resolution = sourceIndex === null ? { kind: 'missing' as const } : resolveSource(sourceIndex, entry.from);
    if (resolution.kind === 'missing') return { anchor: entry.anchor, state: 'source-missing' };
    if (entry.acceptedBy === undefined) return { anchor: entry.anchor, state: 'pending' };
    if (entry.acceptedBy !== undefined && normalizeActor(entry.acceptedBy) === normalizeActor(entry.capturedBy)) return { anchor: entry.anchor, state: 'self-approved' };
    if (isSourceUnresolved(resolution) && chapterStatus !== null && FINAL_STATUSES.has(chapterStatus)) {
      return { anchor: entry.anchor, state: 'open-stated-as-final' };
    }
    const judged = judgeFingerprint(entry.fingerprint, entry.normalizationVersion, resolution.text, links.rewriterFor(resolution.doc.relPath));
    if (judged === 'changed') return { anchor: entry.anchor, state: 'stale', detail: `${resolution.doc.relPath}:${resolution.line}` };
    if (judged !== 'ok') return { anchor: entry.anchor, state: 'needs-recompute', detail: judged.needsRecompute };
    return { anchor: entry.anchor, state: 'ok' };
  }

  if (entry.acceptedBy === undefined) return { anchor: entry.anchor, state: 'pending' };
  if (entry.acceptedBy !== undefined && normalizeActor(entry.acceptedBy) === normalizeActor(entry.capturedBy)) return { anchor: entry.anchor, state: 'self-approved' };
  const judged = judgeFingerprint(entry.blockFingerprint, entry.normalizationVersion, block.text, links.rewriterFor(chapterRelPath));
  if (judged === 'changed') return { anchor: entry.anchor, state: 'orphan-content' };
  if (judged !== 'ok') return { anchor: entry.anchor, state: 'needs-recompute', detail: judged.needsRecompute };
  return { anchor: entry.anchor, state: 'ok' };
}

export interface ProvenanceCheckOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
  /** 絶対パス。省略なら docsDir 内の delivery-chapter 全部 */
  readonly chapters?: readonly string[];
  /** needs-recompute を既定の警告でなく Violation に上げる (§6) */
  readonly strictNormalization?: boolean;
}

export class ProvenanceCheck {
  readonly #options: ProvenanceCheckOptions;
  #warnings: string[] = [];

  constructor(options: ProvenanceCheckOptions) {
    this.#options = options;
  }

  get warnings(): readonly string[] {
    return this.#warnings;
  }

  analyze(): { violations: readonly Violation[] } {
    this.#warnings = [];
    const docsDir = this.#options.docsDir ?? join(this.#options.targetRoot, 'docs');
    const chapterPaths = this.#options.chapters ?? findDeliveryChapters(docsDir);
    const violations: Violation[] = [];
    if (chapterPaths.length === 0) return { violations }; // sidecar が 1 つも無い既存案件は赤くしない

    const sourceIndex = buildSourceIndex(this.#options.targetRoot, docsDir);
    const links = buildLinkTable(this.#options.targetRoot, sourceIndex);
    const strict = this.#options.strictNormalization ?? false;

    for (const chapterAbsPath of chapterPaths) {
      const chapterRelPath = relative(this.#options.targetRoot, chapterAbsPath);
      if (!existsSync(chapterAbsPath)) {
        violations.push({ severity: 'cannot-check', message: `章が無い: ${chapterRelPath}` });
        continue;
      }
      const content = readFileSync(chapterAbsPath, 'utf8');
      const meta = parseFrontmatter(content.split(/\r?\n/));
      const chapterStatus = meta === null ? null : scalar(meta.data, 'status') ?? null;

      const extracted = extractDeliveryBlocks(content, chapterRelPath);
      if (extracted.kind === 'unclosed-autogen') {
        violations.push({ severity: 'cannot-check', message: extracted.message });
        continue;
      }

      // 同じ見出し (anchor) が章に 2 つ以上あると、1 エントリで両方が「網羅済み」になってしまう
      // (anchor は文字列一致でしか塊を特定できないため)。sidecar の有無に関わらず検査する
      // (code-reviewer round 1 blocker 5、provenance-coverage と同じ判定)。
      const linesByAnchor = new Map<string, number[]>();
      for (const block of extracted.blocks) {
        const lines = linesByAnchor.get(block.anchor) ?? [];
        lines.push(block.line);
        linesByAnchor.set(block.anchor, lines);
      }
      for (const [anchor, lines] of linesByAnchor) {
        if (lines.length > 1) {
          violations.push({
            severity: 'violation',
            file: chapterRelPath,
            line: lines[0],
            message: `見出し (anchor) が章に ${lines.length} 件重複している: ${anchor} (行 ${lines.join(', ')}。見出しを変えて区別する)`,
          });
        }
      }

      const sidecarResult = readSidecar(chapterAbsPath);
      if (sidecarResult.kind === 'invalid') {
        violations.push(sidecarResult.violation);
        continue;
      }
      if (sidecarResult.kind === 'absent') continue; // 由来が 1 件も無い章 → provenance-coverage の役割

      for (const entry of sidecarResult.sidecar.entries) {
        const { state, detail } = evaluateEntry(entry, extracted.blocks, chapterStatus, sourceIndex, links, chapterRelPath);
        if (state === 'ok') continue;
        const message = `${entry.anchor}: ${state}${detail !== undefined ? ` (${detail})` : ''}`;
        if (state === 'needs-recompute' && !strict) {
          this.#warnings.push(`${chapterRelPath} ${message}`);
          continue;
        }
        violations.push({ severity: 'violation', file: chapterRelPath, message });
      }
    }
    return { violations };
  }
}
