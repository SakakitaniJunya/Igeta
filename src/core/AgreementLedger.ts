// 顧客との合意台帳 (`agreements.ledger.jsonl`) の形と読み書き。追記のみ。
// Spec: docs/explanation/08-agreement-ledger.md、docs/adr/0006-provenance-migration-handling.md (決定 7・8)、
//       docs/adr/0007-fingerprint-link-normalization.md (決定 2)
//
// 置き場所は「提出物のディレクトリ」(章・sidecar と同じディレクトリ) 直下。事前に manifest から
// 一意に決められない (manifest 自身は 1 段浅いことが多い設計) ため、呼び出し側が決めて渡す。
//
// 行の種類は 4 つ。export (提出)・approve (承認) のほかに、中身を変えない操作の記録として
// fingerprint-rebase (指紋の正規化の版の載せ替えの対応表)・source-move (由来の from の付け替え) を追記する。
// どちらも過去の行は書き換えない。承認の記録ではないので、承認があるとみなす根拠にはならない。

import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isImplementedNormalizationVersion } from './Fingerprint.js';
import type { Violation } from './Report.js';

export const LEDGER_FILENAME = 'agreements.ledger.jsonl';

/**
 * 版を持たない export の行 (`normalizationVersion` の項目ができる前に書かれた行) の正規化の版。
 * 項目ができる前にリリースされた正規化は v2 だけ (Fingerprint.ts を入れた最初の commit から CURRENT は 2)。
 */
export const LEDGER_LEGACY_NORMALIZATION_VERSION = 2;

/** fingerprint-rebase の対応表で、章の本文の指紋 (`chapterFingerprint`) を指す対象名。他の対象は `sources[].from` の値。 */
export const CHAPTER_FINGERPRINT_TARGET = 'chapterFingerprint';

export interface AgreementExportChapter {
  /** 提出物のディレクトリからの相対パス */
  readonly file: string;
  /** その時点の章本文 (frontmatter/AUTOGEN/omitSections 除去済み、PDF に出る本文) の指紋 */
  readonly chapterFingerprint: string;
  readonly sources: readonly { readonly from: string; readonly fingerprint: string }[];
}

export interface AgreementExportEvent {
  readonly event: 'export';
  readonly version: string;
  readonly date: string;
  /** 提出物のディレクトリから見た manifest の相対パス (参考情報) */
  readonly manifest: string;
  /** 記録時点の omitSections。agreement-check が章本文を再計算するときに同じ除去を再現する */
  readonly omitSections: readonly string[];
  /** この行の指紋 (chapterFingerprint と sources[].fingerprint) を計算した正規化の版。無い行は LEDGER_LEGACY_NORMALIZATION_VERSION */
  readonly normalizationVersion?: number;
  readonly chapters: readonly AgreementExportChapter[];
}

export interface AgreementApproveEvent {
  readonly event: 'approve';
  readonly targetVersion: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly note?: string;
}

/** 指紋 1 つごとの対応表の 1 行。キーは (file, target)。from が保存値、to が同じ本文から toVersion で計算した値。 */
export interface FingerprintRebaseEntry {
  /** 提出物のディレクトリからの章の相対パス (export の chapters[].file と同じ) */
  readonly file: string;
  /** `chapterFingerprint` か、`sources[].from` の値 */
  readonly target: string;
  readonly from: string;
  readonly to: string;
}

export interface AgreementFingerprintRebaseEvent {
  readonly event: 'fingerprint-rebase';
  readonly date: string;
  /** 機械の操作であることを示す ('igeta')。承認の記録ではない */
  readonly rebasedBy: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly entries: readonly FingerprintRebaseEntry[];
}

export interface AgreementSourceMoveEvent {
  readonly event: 'source-move';
  readonly date: string;
  /** 機械の操作であることを示す ('igeta')。承認の記録ではない */
  readonly movedBy: string;
  /** 元の `from` (`<doc-id>/PREFIX-nnn` または `<doc-id>#<見出し>`) */
  readonly from: string;
  /** 新しい `from` */
  readonly to: string;
}

export type AgreementEvent = AgreementExportEvent | AgreementApproveEvent | AgreementFingerprintRebaseEvent | AgreementSourceMoveEvent;

export function ledgerPathFor(submissionDir: string): string {
  return join(submissionDir, LEDGER_FILENAME);
}

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage']);

/** dir 以下の台帳のあるディレクトリ (提出物のディレクトリ) を全部集める。dir がディレクトリでなければ []。 */
export function findLedgerDirs(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
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

export type ReadLedgerResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'ok'; readonly events: readonly AgreementEvent[] }
  | { readonly kind: 'invalid'; readonly violation: Violation };

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * 章の相対パスが提出物のディレクトリの中に収まるか (lexical 判定)。
 * 台帳は人が書き換えうるファイルなので、`../` や絶対パスで外を読ませる行を拒否する
 * (Manifest.ts の章パス検査と同じ型。symlink の実体まではここでは見ない)。
 */
function isChapterPathWithin(submissionDir: string, file: string): boolean {
  if (isAbsolute(file)) return false;
  const rel = relative(submissionDir, resolve(submissionDir, file));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function validateExportEvent(record: Record<string, unknown>, path: string, lineNo: number, submissionDir: string): AgreementExportEvent | string {
  if (!isNonEmptyString(record['version'])) return `${path}:${lineNo} export に version が無い`;
  if (!isNonEmptyString(record['date'])) return `${path}:${lineNo} export に date が無い`;
  if (!isNonEmptyString(record['manifest'])) return `${path}:${lineNo} export に manifest が無い`;
  if (!isStringArray(record['omitSections'])) return `${path}:${lineNo} export の omitSections が配列でない`;
  const normalizationVersion = record['normalizationVersion'];
  if (normalizationVersion !== undefined && !isPositiveInteger(normalizationVersion)) {
    return `${path}:${lineNo} export の normalizationVersion が正の整数でない`;
  }
  const chaptersRaw = record['chapters'];
  if (!Array.isArray(chaptersRaw)) return `${path}:${lineNo} export の chapters が配列でない`;
  const chapters: AgreementExportChapter[] = [];
  for (const raw of chaptersRaw) {
    if (typeof raw !== 'object' || raw === null) return `${path}:${lineNo} export の chapters の要素がオブジェクトでない`;
    const c = raw as Record<string, unknown>;
    if (!isNonEmptyString(c['file'])) return `${path}:${lineNo} export の chapters[].file が無い`;
    if (!isChapterPathWithin(submissionDir, c['file'])) {
      return `${path}:${lineNo} export の chapters[].file が提出物のディレクトリの外を指している: ${c['file']}`;
    }
    if (!isNonEmptyString(c['chapterFingerprint'])) return `${path}:${lineNo} export の chapters[].chapterFingerprint が無い`;
    const sourcesRaw = c['sources'];
    if (!Array.isArray(sourcesRaw)) return `${path}:${lineNo} export の chapters[].sources が配列でない`;
    const sources: { from: string; fingerprint: string }[] = [];
    for (const s of sourcesRaw) {
      if (typeof s !== 'object' || s === null) return `${path}:${lineNo} export の sources の要素がオブジェクトでない`;
      const sr = s as Record<string, unknown>;
      if (!isNonEmptyString(sr['from']) || !isNonEmptyString(sr['fingerprint'])) {
        return `${path}:${lineNo} export の sources[] は from/fingerprint が必須`;
      }
      sources.push({ from: sr['from'], fingerprint: sr['fingerprint'] });
    }
    chapters.push({ file: c['file'], chapterFingerprint: c['chapterFingerprint'], sources });
  }
  return {
    event: 'export',
    version: record['version'] as string,
    date: record['date'] as string,
    manifest: record['manifest'] as string,
    omitSections: record['omitSections'] as string[],
    ...(isPositiveInteger(normalizationVersion) ? { normalizationVersion } : {}),
    chapters,
  };
}

function validateApproveEvent(record: Record<string, unknown>, path: string, lineNo: number): AgreementApproveEvent | string {
  if (!isNonEmptyString(record['targetVersion'])) return `${path}:${lineNo} approve に targetVersion が無い`;
  if (!isNonEmptyString(record['approvedBy'])) return `${path}:${lineNo} approve に approvedBy が無い`;
  if (!isNonEmptyString(record['approvedAt'])) return `${path}:${lineNo} approve に approvedAt が無い`;
  const note = record['note'];
  if (note !== undefined && typeof note !== 'string') return `${path}:${lineNo} approve の note は文字列でなければならない`;
  return {
    event: 'approve',
    targetVersion: record['targetVersion'] as string,
    approvedBy: record['approvedBy'] as string,
    approvedAt: record['approvedAt'] as string,
    ...(typeof note === 'string' ? { note } : {}),
  };
}

function validateRebaseEvent(record: Record<string, unknown>, path: string, lineNo: number, submissionDir: string): AgreementFingerprintRebaseEvent | string {
  if (!isNonEmptyString(record['date'])) return `${path}:${lineNo} fingerprint-rebase に date が無い`;
  if (!isNonEmptyString(record['rebasedBy'])) return `${path}:${lineNo} fingerprint-rebase に rebasedBy が無い`;
  const fromVersion = record['fromVersion'];
  const toVersion = record['toVersion'];
  if (!isPositiveInteger(fromVersion)) return `${path}:${lineNo} fingerprint-rebase の fromVersion が正の整数でない`;
  if (!isPositiveInteger(toVersion)) return `${path}:${lineNo} fingerprint-rebase の toVersion が正の整数でない`;
  const entriesRaw = record['entries'];
  if (!Array.isArray(entriesRaw)) return `${path}:${lineNo} fingerprint-rebase の entries が配列でない`;
  const entries: FingerprintRebaseEntry[] = [];
  for (const raw of entriesRaw) {
    if (typeof raw !== 'object' || raw === null) return `${path}:${lineNo} fingerprint-rebase の entries の要素がオブジェクトでない`;
    const e = raw as Record<string, unknown>;
    if (!isNonEmptyString(e['file']) || !isNonEmptyString(e['target']) || !isNonEmptyString(e['from']) || !isNonEmptyString(e['to'])) {
      return `${path}:${lineNo} fingerprint-rebase の entries[] は file/target/from/to が必須`;
    }
    if (!isChapterPathWithin(submissionDir, e['file'])) {
      return `${path}:${lineNo} fingerprint-rebase の entries[].file が提出物のディレクトリの外を指している: ${e['file']}`;
    }
    entries.push({ file: e['file'], target: e['target'], from: e['from'], to: e['to'] });
  }
  return { event: 'fingerprint-rebase', date: record['date'], rebasedBy: record['rebasedBy'], fromVersion, toVersion, entries };
}

function validateMoveEvent(record: Record<string, unknown>, path: string, lineNo: number): AgreementSourceMoveEvent | string {
  if (!isNonEmptyString(record['date'])) return `${path}:${lineNo} source-move に date が無い`;
  if (!isNonEmptyString(record['movedBy'])) return `${path}:${lineNo} source-move に movedBy が無い`;
  if (!isNonEmptyString(record['from']) || !isNonEmptyString(record['to'])) return `${path}:${lineNo} source-move は from/to が必須`;
  if (record['from'] === record['to']) return `${path}:${lineNo} source-move の from と to が同じ`;
  return { event: 'source-move', date: record['date'], movedBy: record['movedBy'], from: record['from'], to: record['to'] };
}

/** ledger が無いのは正当な状態 (absent)。壊れた行が 1 つでもあれば invalid (黙って読み飛ばさない)。 */
export function readLedger(submissionDir: string): ReadLedgerResult {
  const path = ledgerPathFor(submissionDir);
  if (!existsSync(path)) return { kind: 'absent' };

  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const events: AgreementEvent[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    let raw: unknown;
    try {
      raw = JSON.parse(lines[i] ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}:${lineNo} JSON が壊れている: ${message}` } };
    }
    if (typeof raw !== 'object' || raw === null) {
      return { kind: 'invalid', violation: { severity: 'cannot-check', message: `${path}:${lineNo} オブジェクトでない` } };
    }
    const record = raw as Record<string, unknown>;
    let result: AgreementEvent | string;
    if (record['event'] === 'export') result = validateExportEvent(record, path, lineNo, submissionDir);
    else if (record['event'] === 'approve') result = validateApproveEvent(record, path, lineNo);
    else if (record['event'] === 'fingerprint-rebase') result = validateRebaseEvent(record, path, lineNo, submissionDir);
    else if (record['event'] === 'source-move') result = validateMoveEvent(record, path, lineNo);
    else {
      return {
        kind: 'invalid',
        violation: { severity: 'cannot-check', message: `${path}:${lineNo} event が export/approve/fingerprint-rebase/source-move のどれでもない` },
      };
    }
    if (typeof result === 'string') return { kind: 'invalid', violation: { severity: 'cannot-check', message: result } };
    events.push(result);
  }
  return { kind: 'ok', events };
}

/**
 * 追記のみ。既存行は書き換えない。
 * 末尾が改行で終わっていない台帳には追記しない (前の行と繋がって両方が壊れるため)。
 * 追記できたら null、できなければ理由を返す。
 */
export function appendLedgerEvent(submissionDir: string, event: AgreementEvent): Violation | null {
  const path = ledgerPathFor(submissionDir);
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current !== '' && !current.endsWith('\n')) {
      return { severity: 'cannot-check', message: `${path} の末尾が改行で終わっていない (前の追記が途中で切れた疑い。追記しない)` };
    }
  }
  appendFileSync(path, `${JSON.stringify(event)}\n`);
  return null;
}

/** export の行の指紋を計算した正規化の版 (無い行は項目ができる前の行 = v2)。 */
export const exportNormalizationVersion = (event: AgreementExportEvent): number =>
  event.normalizationVersion ?? LEDGER_LEGACY_NORMALIZATION_VERSION;

export type Baseline =
  | { readonly kind: 'none' }
  | { readonly kind: 'export-missing'; readonly versions: readonly string[] }
  | { readonly kind: 'ok'; readonly event: AgreementExportEvent; readonly index: number };

/**
 * agreement-check の基準: 「承認済みの版のうち、提出の記録が最も後の版」。agreement-approve は
 * 基準より前に提出された版の承認を拒否するため、通常は「最後に承認された版」と一致する。
 * 承認と提出が交差する古い台帳 (ガード導入前) でも、基準が過去へ戻らないように
 * 承認の記録順ではなく提出の記録順で選ぶ。index は events の中の位置。
 */
export function findBaseline(events: readonly AgreementEvent[]): Baseline {
  const approved = new Set<string>();
  for (const event of events) if (event.event === 'approve') approved.add(event.targetVersion);
  if (approved.size === 0) return { kind: 'none' };
  let found: { event: AgreementExportEvent; index: number } | undefined;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event !== undefined && event.event === 'export' && approved.has(event.version)) found = { event, index };
  }
  if (found === undefined) return { kind: 'export-missing', versions: [...approved] };
  return { kind: 'ok', event: found.event, index: found.index };
}

/** source-move の 1 本 (元の from → 新しい from)。 */
export interface SourceMoveStep {
  readonly from: string;
  readonly to: string;
}

/**
 * afterIndex より後の source-move を、記録の順に並べたもの。followRedirect に渡して、由来の from の今の居場所を求める。
 * 基準の行より前の付け替えは、基準の行の値に効かない。
 */
export function sourceRedirects(events: readonly AgreementEvent[], afterIndex: number): readonly SourceMoveStep[] {
  return events.slice(afterIndex + 1).flatMap((event) => (event.event === 'source-move' ? [{ from: event.from, to: event.to }] : []));
}

/**
 * 由来の from (提出したときの居場所) を、付け替えを記録の順に当てて、今の居場所にする。
 * 付け替えは「そのとき X にいる行を Y へ」なので、id ごとに居場所を追う (居場所が X のときだけ Y へ動く)。
 * 後から別の行が X へ移ってきても (A → B のあとの C → A)、先に B へ動いた行には効かない。
 * 行の入れ替え (A → T、B → A、T → B) は、2 行とも相手のいた場所へ届く。付け替えが無ければそのまま。
 */
export function followRedirect(moves: readonly SourceMoveStep[], from: string): string {
  let location = from;
  for (const move of moves) if (move.from === location) location = move.to;
  return location;
}

/** fingerprint-rebase の対応表の 1 行を引くキー (章ファイル + 対象 + 保存値)。 */
export const rebaseKey = (file: string, target: string, from: string): string => JSON.stringify([file, target, from]);

export interface RebasedFingerprint {
  readonly to: string;
  readonly toVersion: number;
}

/**
 * afterIndex より後の fingerprint-rebase の対応表。保存値 (from) ごとに、直近の行が対応づけた値を返す
 * (後の行が前の行を上書きする)。保存値まで合わせて引くので、別の提出の保存値には効かない。
 */
export function rebaseTable(events: readonly AgreementEvent[], afterIndex: number): ReadonlyMap<string, RebasedFingerprint> {
  const table = new Map<string, RebasedFingerprint>();
  for (const event of events.slice(afterIndex + 1)) {
    if (event.event !== 'fingerprint-rebase') continue;
    for (const entry of event.entries) table.set(rebaseKey(entry.file, entry.target, entry.from), { to: entry.to, toVersion: event.toVersion });
  }
  return table;
}

/**
 * 台帳の保存値が、今の本文と一致するか (agreement-check の「変わっていない」の判定。行を移す側も同じ判定で確かめる)。
 * 一致 = 提出の行の版 (storedVersion) で今の本文を計算した値が保存値と同じ、または直近の fingerprint-rebase が
 * その保存値に対応づけた値 (rebased) と、その表の版で計算した今の本文が同じ。
 * 表の版の実装が無ければ確かめられない ('unverifiable')。storedVersion の実装は呼び出し側が先に確かめる。
 */
export function matchesRecorded(
  stored: string,
  storedVersion: number,
  compute: (version: number) => string,
  rebased: RebasedFingerprint | undefined,
): boolean | 'unverifiable' {
  if (compute(storedVersion) === stored) return true;
  if (rebased === undefined) return false;
  if (!isImplementedNormalizationVersion(rebased.toVersion)) return 'unverifiable';
  return compute(rebased.toVersion) === rebased.to;
}
