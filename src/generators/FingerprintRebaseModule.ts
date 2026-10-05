// fingerprint-rebase: 由来 sidecar と合意台帳の指紋を、今の正規化の版へ載せ替える。
// Spec: docs/adr/0007-fingerprint-link-normalization.md 決定 2
//
// 各エントリの対象本文を保存値の版で計算し、保存値と一致したものだけ、同じ本文から今の版で計算し直す。
// 一致しないもの・保存値の版の実装が無いものは触らない (人の確認に回る)。承認は書き換えない。
//   - sidecar: 指紋と normalizationVersion を付け替え、rebasedFrom/At/By を足す。acceptedBy/At は保つ
//   - 合意台帳: 過去の行は書き換えず、fingerprint-rebase の行を追記する (指紋 1 つごとの対応表)

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgreementFingerprintRebaseEvent, FingerprintRebaseEntry } from '../core/AgreementLedger.js';
import {
  CHAPTER_FINGERPRINT_TARGET,
  appendLedgerEvent,
  exportNormalizationVersion,
  findBaseline,
  findLedgerDirs,
  ledgerPathFor,
  readLedger,
  rebaseKey,
  rebaseTable,
} from '../core/AgreementLedger.js';
import { extractDeliveryBlocks, findDeliveryChapters } from '../core/DeliveryBlocks.js';
import type { DestinationRewriter } from '../core/Fingerprint.js';
import { CURRENT_NORMALIZATION_VERSION } from '../core/Fingerprint.js';
import type { ChangeItem, RebaseDecision } from '../core/FingerprintRebase.js';
import { IGETA_ACTOR, decideRebase, describeKept, rebasedEntry } from '../core/FingerprintRebase.js';
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

export interface RebaseRequest {
  readonly targetRoot: string;
  /** 由来の `from` を解決する正本の検索対象 */
  readonly docsDir: string;
  /** 章の由来 (sidecar) と合意台帳を探す起点。docsDir の中でも、提出物のディレクトリでもよい */
  readonly dir: string;
  readonly now?: Date;
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

    const decision = decideRebase({ stored, storedVersion: entry.normalizationVersion, text, rewrite });
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
        const decision = decideRebase({ stored: chapter.chapterFingerprint, storedVersion: version, text: body, rewrite: ctx.links.rewriterFor(relPath) });
        if (decision.kind === 'kept') keep(CHAPTER_FINGERPRINT_TARGET, describeKept(decision.reason, version));
        else add(CHAPTER_FINGERPRINT_TARGET, chapter.chapterFingerprint, decision);
      } catch (error) {
        if (!(error instanceof UnclosedAutogenError)) throw error;
        ctx.violations.push({ severity: 'cannot-check', file: relPath, message: error.message });
      }

      for (const source of chapter.sources) {
        const resolution = ctx.sourceIndex === null ? { kind: 'missing' as const } : resolveSource(ctx.sourceIndex, source.from);
        if (resolution.kind === 'missing') {
          keep(source.from, `由来が指す正本が無い: ${source.from} (載せ替えない)`);
          continue;
        }
        const decision = decideRebase({
          stored: source.fingerprint,
          storedVersion: version,
          text: resolution.text,
          rewrite: ctx.links.rewriterFor(resolution.doc.relPath),
        });
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
