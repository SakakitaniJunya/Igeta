// provenance-accept: 別の主体が由来を承認する。指紋を今の値に更新して記録する。
// Spec: docs/explanation/04-provenance-and-agreement.md §4〜§5
//
// self-approved (capturedBy と by が同じ) や、対象の塊・正本が今解決できないエントリは
// per-entry の問題として扱う (Violation/CannotCheck を積んで skip)。--all のとき、1 件が
// 問題でも他の解決できるエントリはそのまま accept して書き込む (全か無かにしない)。

import { readFileSync } from 'node:fs';
import { normalizeActor } from '../core/ActorName.js';
import { extractDeliveryBlocks } from '../core/DeliveryBlocks.js';
import { computeFingerprint, CURRENT_NORMALIZATION_VERSION } from '../core/Fingerprint.js';
import type { ProvenanceEntry } from '../core/ProvenanceSidecar.js';
import { readSidecar, writeSidecar } from '../core/ProvenanceSidecar.js';
import type { SourceIndex } from '../core/SourceResolver.js';
import { resolveSource } from '../core/SourceResolver.js';
import type { Violation } from '../core/Report.js';

export type AcceptTarget = { readonly kind: 'anchor'; readonly anchor: string } | { readonly kind: 'all' };

export interface AcceptRequest {
  readonly chapterAbsPath: string;
  readonly chapterRelPath: string;
  readonly target: AcceptTarget;
  readonly by: string;
  readonly sourceIndex: SourceIndex | null;
  readonly now?: Date;
}

export interface AcceptResult {
  readonly violations: readonly Violation[];
  /** 実際に受け入れた anchor の一覧 (何も更新されなければ空) */
  readonly accepted: readonly string[];
}

export function accept(request: AcceptRequest): AcceptResult {
  const existing = readSidecar(request.chapterAbsPath);
  if (existing.kind === 'absent') {
    return { violations: [{ severity: 'cannot-check', message: `sidecar が無い: ${request.chapterRelPath}` }], accepted: [] };
  }
  if (existing.kind === 'invalid') return { violations: [existing.violation], accepted: [] };

  const target = request.target;
  const targets = target.kind === 'all' ? existing.sidecar.entries : existing.sidecar.entries.filter((e) => e.anchor === target.anchor);
  if (target.kind === 'anchor' && targets.length === 0) {
    return { violations: [{ severity: 'cannot-check', message: `anchor の由来が無い: ${target.anchor}` }], accepted: [] };
  }

  const content = readFileSync(request.chapterAbsPath, 'utf8');
  const extracted = extractDeliveryBlocks(content, request.chapterRelPath);
  const blocks = extracted.kind === 'ok' ? extracted.blocks : [];

  const violations: Violation[] = [];
  const accepted: string[] = [];
  const acceptedAt = (request.now ?? new Date()).toISOString().slice(0, 10);
  const by = normalizeActor(request.by);
  const updated = new Map<string, ProvenanceEntry>();

  for (const entry of targets) {
    // 前後の空白・大文字小文字・全角半角の書式の違いだけで self-approved の判定が揺れないよう、
    // 比較の前に両方を同じ正規化にかける (code-reviewer round 1 blocker 3)。別名 (同じ主体の
    // 別の名乗り) は機械で見抜けない (04-provenance-and-agreement.md §9)。
    if (normalizeActor(entry.capturedBy) === by) {
      violations.push({
        severity: 'violation',
        message: `self-approved: ${entry.anchor} は capturedBy (${entry.capturedBy}) と同じ主体で accept できない`,
      });
      continue;
    }
    const block = blocks.find((b) => b.anchor === entry.anchor);
    if (block === undefined) {
      violations.push({ severity: 'cannot-check', message: `anchor が章に無い (orphan): ${entry.anchor}` });
      continue;
    }
    if (entry.from === null) {
      updated.set(entry.anchor, {
        ...entry,
        blockFingerprint: computeFingerprint(block.text),
        acceptedBy: by,
        acceptedAt,
        normalizationVersion: CURRENT_NORMALIZATION_VERSION,
      });
      accepted.push(entry.anchor);
      continue;
    }
    if (request.sourceIndex === null) {
      violations.push({ severity: 'cannot-check', message: `docs が無く from を再解決できない: ${entry.anchor}` });
      continue;
    }
    const resolution = resolveSource(request.sourceIndex, entry.from);
    if (resolution.kind === 'missing') {
      violations.push({ severity: 'cannot-check', message: `from が解決できない (source-missing): ${entry.anchor} (${entry.from})` });
      continue;
    }
    updated.set(entry.anchor, {
      ...entry,
      fingerprint: computeFingerprint(resolution.text),
      acceptedBy: by,
      acceptedAt,
      normalizationVersion: CURRENT_NORMALIZATION_VERSION,
    });
    accepted.push(entry.anchor);
  }

  if (updated.size > 0) {
    const entries = existing.sidecar.entries.map((e) => updated.get(e.anchor) ?? e);
    writeSidecar(request.chapterAbsPath, { ...existing.sidecar, entries });
  }

  return { violations, accepted };
}
