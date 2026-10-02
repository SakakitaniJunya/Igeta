// fingerprint-rebase: 由来 sidecar と合意台帳の指紋を、今の正規化の版へ載せ替える。
// Spec: docs/adr/0007-fingerprint-link-normalization.md 決定 2、docs/adr/0006-provenance-migration-handling.md 決定 6 (b)
//
// 各エントリの対象本文を保存値の版で計算し、保存値と一致したものだけ、同じ本文から今の版で計算し直す。
// 一致しないもの・保存値の版の実装が無いものは触らない (人の確認に回る)。承認は書き換えない。
//   - sidecar: 指紋と normalizationVersion を付け替え、rebasedFrom/At/By を足す。acceptedBy/At は保つ
//   - 合意台帳: 過去の行は書き換えず、fingerprint-rebase の行を追記する (指紋 1 つごとの対応表)
// 状態の列だけを足した行 (ADR-0006 決定 6 (b)) は、stateColumnRows で元の行を渡すと同じ手順で載せ替える
// (docs-migrate が呼ぶ。元の行は書き換え前の本文で、CLI からは渡せない)。

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgreementFingerprintRebaseEvent, FingerprintRebaseEntry } from '../core/AgreementLedger.js';
import {
  CHAPTER_FINGERPRINT_TARGET,
  appendLedgerEvent,
  exportNormalizationVersion,
  findBaseline,
  findLedgerDirs,
  followRedirect,
  ledgerPathFor,
  readLedger,
  rebaseKey,
  rebaseTable,
  sourceRedirects,
} from '../core/AgreementLedger.js';
import { extractDeliveryBlocks, findDeliveryChapters } from '../core/DeliveryBlocks.js';
import type { DestinationRewriter } from '../core/Fingerprint.js';
import { CURRENT_NORMALIZATION_VERSION } from '../core/Fingerprint.js';
import type { ChangeItem, RebaseDecision } from '../core/FingerprintRebase.js';
import { IGETA_ACTOR, decideRebase, decideStateColumnRebase, describeKept, rebasedEntry } from '../core/FingerprintRebase.js';
import type { LinkTable } from '../core/LinkTable.js';
import { buildLinkTable } from '../core/LinkTable.js';
import type { ProvenanceEntry } from '../core/ProvenanceSidecar.js';
import { readSidecar, writeSidecar } from '../core/ProvenanceSidecar.js';
import type { Violation } from '../core/Report.js';
import type { SourceIndex } from '../core/SourceResolver.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';
import { isPathWithinRealDir } from '../export/Manifest.js';
import { UnclosedAutogenError } from '../export/MarkdownStrip.js';
import { chapterBody } from './AgreementRecordModule.js';

/** 状態の列を足す前の表の行。 */
export interface StateColumnRow {
  /** 列を足す前の行 (元の行) */
  readonly oldRow: string;
  /** 元の行がある文書でのリンクの解決。省略すると今の行がある文書のものを使う (列を足す前後で文書の場所が変わらないとき) */
  readonly oldRewrite?: DestinationRewriter;
}

export interface RebaseRequest {
  readonly targetRoot: string;
  /** 由来の `from` を解決する正本の検索対象 */
  readonly docsDir: string;
  /** 章の由来 (sidecar) と合意台帳を探す起点。docsDir の中でも、提出物のディレクトリでもよい */
  readonly dir: string;
  readonly now?: Date;
  /**
   * 状態の列だけを足した表の行。キーは由来の `from` (`<doc-id>/PREFIX-nnn`、今の居場所)。
   * 通常の載せ替えで一致しなかった指紋だけに効く (元の行が保存値と一致し、新しい行が「元の行 + 状態の列」のときだけ載せ替える)。
   */
  readonly stateColumnRows?: ReadonlyMap<string, StateColumnRow>;
}

export interface RebaseResult {
  /** 載せ替えたもの */
  readonly rebased: readonly ChangeItem[];
  /** 触らなかったもの (理由つき。stale のまま人の確認に回る) */
  readonly kept: readonly ChangeItem[];
  /** 読めない sidecar・台帳など (検査不能) */
  readonly violations: readonly Violation[];
}

interface Context {
  readonly request: RebaseRequest;
  readonly sourceIndex: SourceIndex | null;
  readonly links: LinkTable;
  readonly date: string;
  readonly rebased: ChangeItem[];
  readonly kept: ChangeItem[];
  readonly violations: Violation[];
}

/** 通常の載せ替えで一致しなければ、状態の列だけを足した行かどうかを確かめる。from は今の居場所。 */
function decide(
  ctx: Context,
  from: string | null,
  stored: string,
  storedVersion: number,
  text: string,
  rewrite: DestinationRewriter,
): RebaseDecision {
  const normal = decideRebase({ stored, storedVersion, text, rewrite });
  const stateColumn = from === null ? undefined : ctx.request.stateColumnRows?.get(from);
  if (normal.kind === 'rebased' || stateColumn === undefined) return normal;
  return decideStateColumnRebase({
    stored,
    storedVersion,
    oldRow: stateColumn.oldRow,
    oldRewrite: stateColumn.oldRewrite ?? rewrite,
    newRow: text,
    newRewrite: rewrite,
  });
}

function rebaseSidecar(ctx: Context, chapterAbsPath: string): void {
  const read = readSidecar(chapterAbsPath);
  if (read.kind === 'absent') return;
  if (read.kind === 'invalid') {
    ctx.violations.push(read.violation);
    return;
  }
  const chapterRelPath = relative(ctx.request.targetRoot, chapterAbsPath);
  const extracted = extractDeliveryBlocks(readFileSync(chapterAbsPath, 'utf8'), chapterRelPath);
  if (extracted.kind === 'unclosed-autogen') {
    ctx.violations.push({ severity: 'cannot-check', message: extracted.message });
    return;
  }

  const entries = read.sidecar.entries.map((entry): ProvenanceEntry => {
    if (entry.normalizationVersion === CURRENT_NORMALIZATION_VERSION) return entry; // 載せ替える対象ではない
    const keep = (detail: string): ProvenanceEntry => {
      ctx.kept.push({ file: chapterRelPath, target: entry.anchor, detail });
      return entry;
    };

    let stored: string;
    let text: string;
    let rewrite: DestinationRewriter;
    if (entry.from === null) {
      const block = extracted.blocks.find((b) => b.anchor === entry.anchor);
      if (block === undefined) return keep('anchor が章に無い (orphan)。載せ替えない');
      stored = entry.blockFingerprint;
      text = block.text;
      rewrite = ctx.links.rewriterFor(chapterRelPath);
    } else {
      const resolution = ctx.sourceIndex === null ? { kind: 'missing' as const } : resolveSource(ctx.sourceIndex, entry.from);
      if (resolution.kind === 'missing') return keep(`from が解決できない (source-missing): ${entry.from}。載せ替えない`);
      stored = entry.fingerprint;
      text = resolution.text;
      rewrite = ctx.links.rewriterFor(resolution.doc.relPath);
    }

    const decision = decide(ctx, entry.from, stored, entry.normalizationVersion, text, rewrite);
    if (decision.kind === 'kept') return keep(describeKept(decision.reason, entry.normalizationVersion));
    ctx.rebased.push({ file: chapterRelPath, target: entry.anchor, detail: `版 ${entry.normalizationVersion} → ${CURRENT_NORMALIZATION_VERSION}` });
    return rebasedEntry(entry, decision.fingerprint, ctx.date);
  });
  if (entries.some((entry, i) => entry !== read.sidecar.entries[i])) writeSidecar(chapterAbsPath, { ...read.sidecar, entries });
}

function rebaseLedger(ctx: Context, ledgerDir: string): void {
  const { targetRoot } = ctx.request;
  const ledger = readLedger(ledgerDir);
  if (ledger.kind === 'absent') return;
  if (ledger.kind === 'invalid') {
    ctx.violations.push(ledger.violation);
    return;
  }
  const ledgerRelPath = relative(targetRoot, ledgerPathFor(ledgerDir));
  const baseline = findBaseline(ledger.events);
  if (baseline.kind === 'export-missing') {
    ctx.violations.push({
      severity: 'cannot-check',
      file: ledgerRelPath,
      message: `承認された版 (${baseline.versions.join(', ')}) の提出の記録が台帳に無い (載せ替えない)`,
    });
    return;
  }
  // 基準になりうる提出だけを見る。承認の基準は後の提出にだけ進む (基準より前の提出は、もう基準にならない)。
  // 承認された版がまだ無ければ、どの提出も基準になりうる
  const first = baseline.kind === 'ok' ? baseline.index : 0;

  // 保存値の版ごとの対応表 (キー = 章ファイル + 対象 + 保存値)
  const pending = new Map<number, Map<string, FingerprintRebaseEntry>>();
  const pendingItems = new Map<number, ChangeItem[]>();

  for (let index = first; index < ledger.events.length; index += 1) {
    const event = ledger.events[index];
    if (event === undefined || event.event !== 'export') continue;
    const version = exportNormalizationVersion(event);
    if (version === CURRENT_NORMALIZATION_VERSION) continue; // 載せ替える対象ではない
    const redirects = sourceRedirects(ledger.events, index);
    const recorded = rebaseTable(ledger.events, index);
    const entriesForVersion = pending.get(version) ?? new Map<string, FingerprintRebaseEntry>();
    const itemsForVersion = pendingItems.get(version) ?? [];
    pending.set(version, entriesForVersion);
    pendingItems.set(version, itemsForVersion);

    for (const chapter of event.chapters) {
      const where = `提出 ${event.version} ${chapter.file}`;
      const keep = (target: string, detail: string): void => {
        ctx.kept.push({ file: ledgerRelPath, target: `${where} ${target}`, detail });
      };
      // 載せ替える 1 件。既に同じ対応が直近の行にあれば、何もしない (もう一度実行しても行を足さない)
      const add = (target: string, stored: string, decision: Extract<RebaseDecision, { kind: 'rebased' }>): void => {
        const already = recorded.get(rebaseKey(chapter.file, target, stored));
        if (already !== undefined && already.to === decision.fingerprint && already.toVersion === CURRENT_NORMALIZATION_VERSION) return;
        entriesForVersion.set(rebaseKey(chapter.file, target, stored), {
          file: chapter.file,
          target,
          from: stored,
          to: decision.fingerprint,
        });
        itemsForVersion.push({ file: ledgerRelPath, target: `${where} ${target}`, detail: `版 ${version} → ${CURRENT_NORMALIZATION_VERSION}` });
      };

      const absPath = join(ledgerDir, chapter.file);
      const relPath = relative(targetRoot, absPath);
      if (!existsSync(absPath)) {
        keep(CHAPTER_FINGERPRINT_TARGET, '章が無い (載せ替えない)');
        continue;
      }
      if (!isPathWithinRealDir(realpathSync(ledgerDir), absPath)) {
        keep(CHAPTER_FINGERPRINT_TARGET, '章の実体が提出物のディレクトリの外を指している (載せ替えない)');
        continue;
      }
      try {
        const body = chapterBody(readFileSync(absPath, 'utf8'), relPath, event.omitSections);
        const decision = decide(ctx, null, chapter.chapterFingerprint, version, body, ctx.links.rewriterFor(relPath));
        if (decision.kind === 'kept') keep(CHAPTER_FINGERPRINT_TARGET, describeKept(decision.reason, version));
        else add(CHAPTER_FINGERPRINT_TARGET, chapter.chapterFingerprint, decision);
      } catch (error) {
        if (!(error instanceof UnclosedAutogenError)) throw error;
        ctx.violations.push({ severity: 'cannot-check', file: relPath, message: error.message });
      }

      for (const source of chapter.sources) {
        const from = followRedirect(redirects, source.from);
        const resolution = ctx.sourceIndex === null ? { kind: 'missing' as const } : resolveSource(ctx.sourceIndex, from);
        if (resolution.kind === 'missing') {
          keep(source.from, `由来が指す正本が無い: ${from} (載せ替えない)`);
          continue;
        }
        const decision = decide(ctx, from, source.fingerprint, version, resolution.text, ctx.links.rewriterFor(resolution.doc.relPath));
        if (decision.kind === 'kept') keep(source.from, describeKept(decision.reason, version));
        else add(source.from, source.fingerprint, decision);
      }
    }
  }

  for (const [fromVersion, entries] of pending) {
    if (entries.size === 0) continue;
    const event: AgreementFingerprintRebaseEvent = {
      event: 'fingerprint-rebase',
      date: ctx.date,
      rebasedBy: IGETA_ACTOR,
      fromVersion,
      toVersion: CURRENT_NORMALIZATION_VERSION,
      entries: [...entries.values()],
    };
    const failure = appendLedgerEvent(ledgerDir, event);
    if (failure !== null) {
      ctx.violations.push(failure);
      continue;
    }
    ctx.rebased.push(...(pendingItems.get(fromVersion) ?? []));
  }
}

/** dir 以下の sidecar と合意台帳の指紋を載せ替える。確かめられたものだけを書き、触らなかったものは理由を返す。 */
export function rebaseFingerprints(request: RebaseRequest): RebaseResult {
  const sourceIndex = buildSourceIndex(request.targetRoot, request.docsDir);
  const ctx: Context = {
    request,
    sourceIndex,
    links: buildLinkTable(request.targetRoot, sourceIndex),
    date: (request.now ?? new Date()).toISOString().slice(0, 10),
    rebased: [],
    kept: [],
    violations: [],
  };
  for (const chapterAbsPath of findDeliveryChapters(request.dir)) rebaseSidecar(ctx, chapterAbsPath);
  for (const ledgerDir of findLedgerDirs(request.dir)) rebaseLedger(ctx, ledgerDir);
  return { rebased: ctx.rebased, kept: ctx.kept, violations: ctx.violations };
}
