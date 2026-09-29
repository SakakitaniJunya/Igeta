// provenance-capture: 由来を作る・上書きする。
// Spec: docs/explanation/04-provenance-and-agreement.md §4
//
// 上書き (同じ anchor を再度 capture) したら acceptedBy/acceptedAt を消す (未承認に戻す) —
// 新しいエントリを丸ごと作り直すことで自然に実現する (古いエントリの承認情報を引き継がない)。

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import { computeFingerprint, CURRENT_NORMALIZATION_VERSION } from '../core/Fingerprint.js';
import type { ProvenanceEntry, ProvenanceSidecar } from '../core/ProvenanceSidecar.js';
import { readSidecar, writeSidecar } from '../core/ProvenanceSidecar.js';
import type { SourceIndex } from '../core/SourceResolver.js';
import { resolveSource } from '../core/SourceResolver.js';
import type { Violation } from '../core/Report.js';

export type CaptureSource = { readonly kind: 'from'; readonly id: string } | { readonly kind: 'no-source'; readonly reason: string };

export interface CaptureRequest {
  readonly chapterAbsPath: string;
  readonly targetRoot: string;
  readonly anchor: string;
  readonly source: CaptureSource;
  readonly by: string;
  /** --from のとき使う。--no-source なら未使用 (docs が無くても capture できる) */
  readonly sourceIndex: SourceIndex | null;
  readonly now?: Date;
}

export type CaptureResult = { readonly kind: 'ok'; readonly sidecar: ProvenanceSidecar } | { readonly kind: 'error'; readonly violation: Violation };

export function capture(request: CaptureRequest): CaptureResult {
  const content = readFileSync(request.chapterAbsPath, 'utf8');
  const chapterRelPath = relative(request.targetRoot, request.chapterAbsPath);
  const extracted = extractDeliveryBlocks(content, chapterRelPath);
  if (extracted.kind === 'unclosed-autogen') {
    return { kind: 'error', violation: { severity: 'cannot-check', message: extracted.message } };
  }
  const block = extracted.blocks.find((b) => b.anchor === request.anchor);
  if (block === undefined) {
    return { kind: 'error', violation: { severity: 'cannot-check', message: `anchor が章に無い: ${request.anchor}` } };
  }

  const capturedAt = (request.now ?? new Date()).toISOString().slice(0, 10);
  let entry: ProvenanceEntry;
  if (request.source.kind === 'no-source') {
    entry = {
      anchor: request.anchor,
      from: null,
      reason: request.source.reason,
      blockFingerprint: computeFingerprint(block.text),
      capturedBy: request.by,
      capturedAt,
      normalizationVersion: CURRENT_NORMALIZATION_VERSION,
    };
  } else {
    if (request.sourceIndex === null) {
      return { kind: 'error', violation: { severity: 'cannot-check', message: 'docs が無く from を解決できない' } };
    }
    const resolution = resolveSource(request.sourceIndex, request.source.id);
    if (resolution.kind === 'missing') {
      return { kind: 'error', violation: { severity: 'cannot-check', message: `from が解決できない: ${request.source.id}` } };
    }
    entry = {
      anchor: request.anchor,
      from: request.source.id,
      fingerprint: computeFingerprint(resolution.text),
      capturedBy: request.by,
      capturedAt,
      normalizationVersion: CURRENT_NORMALIZATION_VERSION,
    };
  }

  const existing = readSidecar(request.chapterAbsPath);
  if (existing.kind === 'invalid') return { kind: 'error', violation: existing.violation };
  const entries = existing.kind === 'ok' ? existing.sidecar.entries.filter((e) => e.anchor !== request.anchor) : [];
  const sidecar: ProvenanceSidecar = { sourceDoc: chapterRelPath, entries: [...entries, entry] };
  writeSidecar(request.chapterAbsPath, sidecar);
  return { kind: 'ok', sidecar };
}
