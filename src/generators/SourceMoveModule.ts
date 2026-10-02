// 行 (または節) を別の文書へ移したとき、由来の `from` を付け替える。
// Spec: docs/adr/0006-provenance-migration-handling.md 決定 7 (docs-migrate が呼ぶ。コマンドは無い)
//
// 移した行の文字が元と同じことを、保存値の指紋で確かめる (保存値の版で、移した後の行を計算して比べる)。
// 確かめるのは、由来のエントリごと・台帳ごとに、それぞれ自分の保存値で行う:
//   - 由来のエントリ: 保存値が移した行と一致したエントリだけ、`from` を新しい文書の id へ付け替える
//   - 合意台帳: その `from` を指す保存値 (基準の提出以降の全部) が移した行と一致した台帳にだけ、
//     source-move の行 (元の from → 新しい from) を追記する。agreement-check はこの対応を通して照合する
// 文字が違えば付け替えず、台帳にも書かない (顧客への再合意が要るかは、ADR-0006 決定 6 に従って人が選ぶ)。
//
// 台帳の保存値は、由来のエントリとは別に必ず確かめる。由来は取り直して承認し直せるので、由来の保存値が一致しても、
// 台帳の保存値 (承認した提出のときの行) が一致するとは限らない。source-move は agreement-check が行を引く場所を変えるだけで、
// 指紋の比較は変えない。しかし移した先の文書の kind は再合意の規則 (reagreementRules) の判定を変える: 承認の後に書き換えた行を、
// 規則に当たらない文書へ移して source-move を書くと、再合意が要る違反が通知のみの警告に変わる。一致しない台帳に書かないのはそのため。

import { relative } from 'node:path';
import type { AgreementEvent, AgreementSourceMoveEvent, RebasedFingerprint } from '../core/AgreementLedger.js';
import {
  appendLedgerEvent,
  exportNormalizationVersion,
  findBaseline,
  findLedgerDirs,
  followRedirect,
  ledgerPathFor,
  matchesRecorded,
  readLedger,
  rebaseKey,
  rebaseTable,
  sourceRedirects,
} from '../core/AgreementLedger.js';
import { findDeliveryChapters } from '../core/DeliveryBlocks.js';
import type { StoredFingerprintMatch } from '../core/Fingerprint.js';
import { computeFingerprint, isImplementedNormalizationVersion, matchStoredFingerprint } from '../core/Fingerprint.js';
import type { ChangeItem } from '../core/FingerprintRebase.js';
import { IGETA_ACTOR } from '../core/FingerprintRebase.js';
import { buildLinkTable } from '../core/LinkTable.js';
import type { ProvenanceEntry } from '../core/ProvenanceSidecar.js';
import { readSidecar, writeSidecar } from '../core/ProvenanceSidecar.js';
import type { ProvenanceSidecar } from '../core/ProvenanceSidecar.js';
import type { Violation } from '../core/Report.js';
import { buildSourceIndex, resolveSource } from '../core/SourceResolver.js';

export interface SourceMove {
  /** 元の `from` */
  readonly from: string;
  /** 新しい `from` (移した後の文書の id) */
  readonly to: string;
}

export interface SourceMoveRequest {
  readonly targetRoot: string;
  /** 移した後の正本の検索対象 (`to` はここで解決できなければならない) */
  readonly docsDir: string;
  /** 章の由来 (sidecar) と合意台帳を探す起点 */
  readonly dir: string;
  readonly moves: readonly SourceMove[];
  readonly now?: Date;
}

export interface SourceMoveResult {
  /** 付け替えたもの (由来のエントリと、追記した台帳の行) */
  readonly moved: readonly ChangeItem[];
  /** 付け替えなかったもの (理由つき) */
  readonly kept: readonly ChangeItem[];
  /** 読めない sidecar・台帳など (検査不能) */
  readonly violations: readonly Violation[];
}

interface ChapterRef {
  readonly absPath: string;
  readonly relPath: string;
  readonly sidecar: ProvenanceSidecar;
  readonly entries: ProvenanceEntry[];
  changed: boolean;
}

interface LedgerRef {
  readonly dir: string;
  readonly relPath: string;
  /** 読んだ後に追記した行も足していく (続く move の対応づけに使う) */
  readonly events: AgreementEvent[];
  /** 基準になりうる提出の先頭の位置 (基準より前の提出は、もう基準にならない) */
  readonly first: number;
}

/** 保存値が移した行と一致しない理由 (match 以外)。version は保存値の版。 */
const whyNot = (match: StoredFingerprintMatch, version: number): string =>
  match === 'unverifiable' ? `版 ${version} の実装が無く確かめられない` : `版 ${version} で計算した移した後の行が保存値と違う (文字が変わっている)`;

/** 行 (または節) の移動に合わせて、由来の from を付け替え、台帳に source-move を追記する。確かめられたものだけを書く。 */
export function moveSourceRows(request: SourceMoveRequest): SourceMoveResult {
  const { targetRoot } = request;
  const sourceIndex = buildSourceIndex(targetRoot, request.docsDir);
  const links = buildLinkTable(targetRoot, sourceIndex);
  const date = (request.now ?? new Date()).toISOString().slice(0, 10);
  const moved: ChangeItem[] = [];
  const kept: ChangeItem[] = [];
  const violations: Violation[] = [];

  const chapters: ChapterRef[] = [];
  for (const absPath of findDeliveryChapters(request.dir)) {
    const read = readSidecar(absPath);
    if (read.kind === 'absent') continue;
    if (read.kind === 'invalid') {
      violations.push(read.violation);
      continue;
    }
    chapters.push({ absPath, relPath: relative(targetRoot, absPath), sidecar: read.sidecar, entries: [...read.sidecar.entries], changed: false });
  }

  const ledgers: LedgerRef[] = [];
  for (const dir of findLedgerDirs(request.dir)) {
    const read = readLedger(dir);
    if (read.kind === 'absent') continue;
    if (read.kind === 'invalid') {
      violations.push(read.violation);
      continue;
    }
    const baseline = findBaseline(read.events);
    if (baseline.kind === 'export-missing') {
      violations.push({
        severity: 'cannot-check',
        file: relative(targetRoot, ledgerPathFor(dir)),
        message: `承認された版 (${baseline.versions.join(', ')}) の提出の記録が台帳に無い (付け替えない)`,
      });
      continue;
    }
    ledgers.push({ dir, relPath: relative(targetRoot, ledgerPathFor(dir)), events: [...read.events], first: baseline.kind === 'ok' ? baseline.index : 0 });
  }

  for (const move of request.moves) {
    const label = `${move.from} → ${move.to}`;
    const here = relative(targetRoot, request.dir) || '.';
    const resolution = sourceIndex === null ? { kind: 'missing' as const } : resolveSource(sourceIndex, move.to);
    if (resolution.kind === 'missing') {
      kept.push({ file: here, target: label, detail: `新しい from が解決できない: ${move.to} (付け替えない)` });
      continue;
    }
    const rewrite = links.rewriterFor(resolution.doc.relPath);
    const check = (stored: string, version: number): StoredFingerprintMatch => matchStoredFingerprint(stored, version, resolution.text, rewrite);
    // 台帳の保存値は agreement-check と同じ判定で確かめる: 提出の行の版で一致、または fingerprint-rebase の対応表を通して一致
    const checkRecorded = (stored: string, version: number, rebased: RebasedFingerprint | undefined): StoredFingerprintMatch => {
      if (!isImplementedNormalizationVersion(version)) return 'unverifiable';
      const matched = matchesRecorded(stored, version, (v) => computeFingerprint(resolution.text, v, rewrite), rebased);
      return matched === 'unverifiable' ? 'unverifiable' : matched ? 'match' : 'mismatch';
    };

    // この from を指すもの。由来は今の from で、台帳は (これまでの付け替えを通した) 今の from で数える
    const sidecarRefs = chapters.flatMap((chapter) =>
      chapter.entries.flatMap((entry, index) =>
        entry.from === move.from ? [{ chapter, index, entry, match: check(entry.fingerprint, entry.normalizationVersion) }] : [],
      ),
    );
    const ledgerRefs = ledgers.flatMap((ledger) => {
      const refs: { readonly where: string; readonly version: number; readonly match: StoredFingerprintMatch }[] = [];
      for (let index = ledger.first; index < ledger.events.length; index += 1) {
        const event = ledger.events[index];
        if (event === undefined || event.event !== 'export') continue;
        const redirects = sourceRedirects(ledger.events, index);
        const recorded = rebaseTable(ledger.events, index);
        const version = exportNormalizationVersion(event);
        for (const chapter of event.chapters) {
          for (const source of chapter.sources) {
            if (followRedirect(redirects, source.from) !== move.from) continue;
            const match = checkRecorded(source.fingerprint, version, recorded.get(rebaseKey(chapter.file, source.from, source.fingerprint)));
            refs.push({ where: `提出 ${event.version} ${chapter.file}`, version, match });
          }
        }
      }
      return refs.length === 0 ? [] : [{ ledger, refs }];
    });

    if (sidecarRefs.length === 0 && ledgerRefs.length === 0) {
      kept.push({ file: here, target: label, detail: 'この from を指す由来も台帳も無い (付け替える対象が無い)' });
      continue;
    }

    // 由来: 保存値が移した行と一致したエントリだけ付け替える
    for (const ref of sidecarRefs) {
      if (ref.match !== 'match') {
        kept.push({ file: ref.chapter.relPath, target: ref.entry.anchor, detail: `${label}: ${whyNot(ref.match, ref.entry.normalizationVersion)}。付け替えない (再合意が要るかは人が決める)` });
        continue;
      }
      // 指紋・承認・版はそのまま。向き先だけを付け替える
      ref.chapter.entries[ref.index] = { ...ref.entry, from: move.to };
      ref.chapter.changed = true;
      moved.push({ file: ref.chapter.relPath, target: ref.entry.anchor, detail: label });
    }

    // 台帳: その台帳の保存値が (基準の提出以降の全部) 移した行と一致したときだけ書く
    for (const { ledger, refs } of ledgerRefs) {
      const mismatched = refs.filter((r) => r.match !== 'match');
      if (mismatched.length > 0) {
        const list = mismatched.map((r) => `${r.where} (${whyNot(r.match, r.version)})`).join('、');
        kept.push({ file: ledger.relPath, target: label, detail: `台帳の保存値と一致しない提出がある: ${list}。source-move を書かない (再合意が要るかは人が決める)` });
        continue;
      }
      const event: AgreementSourceMoveEvent = { event: 'source-move', date, movedBy: IGETA_ACTOR, from: move.from, to: move.to };
      const failure = appendLedgerEvent(ledger.dir, event);
      if (failure !== null) {
        violations.push(failure);
        continue;
      }
      ledger.events.push(event);
      moved.push({ file: ledger.relPath, target: label, detail: 'source-move を追記' });
    }
  }

  for (const chapter of chapters) {
    if (chapter.changed) writeSidecar(chapter.absPath, { ...chapter.sidecar, entries: chapter.entries });
  }
  return { moved, kept, violations };
}
