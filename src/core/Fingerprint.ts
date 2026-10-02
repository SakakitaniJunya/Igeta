// 由来の指紋 (SHA256) を計算する。設計 (docs/explanation/04-provenance-and-agreement.md §6、
// docs/adr/0007-fingerprint-link-normalization.md) の正規化を実装する。目的は「整形だけの変更では
// 指紋が変わらない」こと。
//
// 正規化は版ごとの実装を残す。保存値は「保存した版」で計算し直して比べる (版が違うだけで stale にしない) ので、
// 古い版の実装を消すと、その版の指紋は確かめられなくなる。v2 の実装を v3 で上書きしない。
//
// v2 (5 手順)
// 1. 改行コードを \n に統一 (CRLF→LF)
// 2. 各行の行末の空白を除去
// 3. 連続する空白 (全角スペース含む) を単一の半角スペースに畳む。**コードフェンスの中は対象外**
//    (字下げが意味を持つ内容だと、字下げが違う別内容が同じ指紋になってしまう。code-reviewer
//    round 1 blocker 1)
// 4. 表の区切り線 (`|---|---|` 相当) は固定文字列に正規化し、表の行はセル内容を trim して詰め直す。
//    **コードフェンスの中は対象外** (3 と同じ理由。表の記法もフェンス内では単なる文字列)
// 5. 全角・半角の文字そのもの (かな漢字英数記号) は変換しない (3 の空白だけを正規化する)
//
// v3 = v2 の後に 1 手順
// 6. コードフェンスの外の Markdown リンク `[文字](行き先)` の行き先を、呼び出し側が渡す関数で直す
//    (core/LinkTable.ts。指す文書の frontmatter `id` に置き換える)。文書を動かすとリンクの相対パスは
//    変わるが、リンク先が同じ文書なら指紋は変わらない。インラインコードの中はリンクではないので対象外
//
// 正規化ルールを変えたら CURRENT_NORMALIZATION_VERSION を上げ、古い版の実装は IMPLEMENTED_VERSIONS に残す。
// sidecar の各エントリはこの版を保存しており、保存した版の実装があれば `provenance-check` はその版で計算して
// 比べる。今の版と違うだけなら `needs-recompute` (既定は警告のみ)。

import { createHash } from 'node:crypto';

/**
 * 正規化ルールの版。既存エントリを一斉に stale へ落とさないための識別子 (§6)。
 * 2: コードフェンスの中の空白畳み込み・表整形を止めた (code-reviewer round 1 blocker 1)。
 * 3: リンクの行き先を、指す文書の id で数える (ADR-0007)。
 */
export const CURRENT_NORMALIZATION_VERSION = 3;

/**
 * 実装を持つ版。版を足したら、ここと normalizeForFingerprint の分岐の両方に足す。
 * 1 は v2 より前の実装で、もう無い (この file を入れた最初の commit から CURRENT は 2)。
 */
const IMPLEMENTED_VERSIONS: readonly number[] = [2, 3];

export const isImplementedNormalizationVersion = (version: number): boolean => IMPLEMENTED_VERSIONS.includes(version);

/**
 * v3 が使う、リンクの行き先 (括弧の中の文字列) を直す関数。リンクの相対パスは「その本文がある文書」を
 * 起点に解決するので、本文がある文書ごとに作る (core/LinkTable.ts の `rewriterFor`)。
 */
export type DestinationRewriter = (destination: string) => string;

/** コードフェンスの開始・終了マーカー行 (```/~~~、3 個以上)。マーカー自体は字下げの意味を持たない。 */
const FENCE_TOGGLE_RE = /^\s{0,3}(`{3,}|~{3,})/;

const TABLE_SEPARATOR_CANONICAL = '|---|';
/** `|---|---|` `| :-- | --: |` 等、`-`・`:`・`|`・空白だけで構成され `-` を含む行 */
const TABLE_SEPARATOR_RE = /^[|:\-\s]+$/;

const collapseSpaces = (text: string): string => text.replace(/[ 　]+/g, ' ');

const isTableSeparatorLine = (trimmed: string): boolean =>
  trimmed.length > 0 && trimmed.includes('-') && TABLE_SEPARATOR_RE.test(trimmed);

const isTableRowLine = (trimmed: string): boolean =>
  trimmed.length >= 2 && trimmed.startsWith('|') && trimmed.endsWith('|');

/** 表の行はセル単位に分けて前後の空白を trim し、一定の間隔で詰め直す (列幅の違いを消す)。 */
const normalizeTableRow = (trimmed: string): string => {
  const inner = trimmed.slice(1, -1);
  const cells = inner.split('|').map((cell) => collapseSpaces(cell.trim()));
  return `| ${cells.join(' | ')} |`;
};

/** フェンス外の行の正規化 (空白畳み込み・表整形の対象)。 */
const normalizeLine = (rawLine: string): string => {
  const noTrailingWs = rawLine.replace(/[ \t]+$/, '');
  const trimmed = noTrailingWs.trim();
  if (isTableSeparatorLine(trimmed)) return TABLE_SEPARATOR_CANONICAL;
  if (isTableRowLine(trimmed)) return normalizeTableRow(trimmed);
  return collapseSpaces(noTrailingWs);
};

/** v2 の正規化 (手順 1〜5)。v3 はこの出力にさらに 1 手順を足すので、この関数は変えない。 */
function normalizeV2(text: string): string {
  const unified = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = unified.split('\n');
  const result: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE_TOGGLE_RE.test(line)) {
      result.push(line.replace(/[ \t]+$/, '')); // マーカー行自体は行末空白の除去だけ
      inFence = !inFence;
      continue;
    }
    // フェンスの中は字下げ・空白がそのまま意味を持つ内容なので、改行統一と行末空白除去だけ適用する
    result.push(inFence ? line.replace(/[ \t]+$/, '') : normalizeLine(line));
  }
  return result.join('\n');
}

/** `[文字](行き先)` と画像 `![代替](行き先)`。行き先は空白・括弧・山括弧を含まない (docs-check の本文リンクと同じ形)。 */
const LINK_RE = /(!?\[[^\]]*\]\(\s*<?)([^)<>\s]+)(>?(?:\s+"[^"]*")?\s*\))/g;
/** 1 行内のインラインコード (同じ長さのバッククォートで閉じる)。中の `[a](b)` はリンクではなく文字そのもの。 */
const CODE_SPAN_RE = /(?<!`)(`+)(?!`).+?(?<!`)\1(?!`)/g;

const maskCodeSpans = (line: string): string => line.replace(CODE_SPAN_RE, (span) => ' '.repeat(span.length));

/** 1 行のリンクの行き先だけを直す。インラインコードは同じ長さの空白に置いて探すので、位置は元の行と揃う。 */
function rewriteLineLinks(line: string, rewrite: DestinationRewriter): string {
  let result = '';
  let cursor = 0;
  for (const match of maskCodeSpans(line).matchAll(LINK_RE)) {
    const start = match.index + (match[1] ?? '').length;
    const end = start + (match[2] ?? '').length;
    result += line.slice(cursor, start) + rewrite(line.slice(start, end));
    cursor = end;
  }
  return result + line.slice(cursor);
}

/** v3 の正規化。v2 の出力に、コードフェンスの外のリンクの行き先を直す手順を足す (フェンスの判定は v2 と同じ規則)。 */
function normalizeV3(text: string, rewrite: DestinationRewriter): string {
  let inFence = false;
  return normalizeV2(text)
    .split('\n')
    .map((line) => {
      if (FENCE_TOGGLE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : rewriteLineLinks(line, rewrite);
    })
    .join('\n');
}

/**
 * SHA256 の前に適用する正規化。指紋以外の用途 (差分表示等) にも使えるよう単体で export する。
 * 実装の無い版は例外にする (一致とみなす代用を作らない)。呼び出し側は isImplementedNormalizationVersion か
 * matchStoredFingerprint で先に確かめる。v3 は `rewrite` が要る (本文がある文書ごとに core/LinkTable.ts が作る)。
 */
export function normalizeForFingerprint(text: string, version: number, rewrite?: DestinationRewriter): string {
  if (version === 2) return normalizeV2(text);
  if (version === 3) {
    if (rewrite === undefined) throw new Error('正規化 v3 にはリンクの行き先を直す関数が要る (core/LinkTable.ts の rewriterFor)');
    return normalizeV3(text, rewrite);
  }
  throw new Error(`正規化の版 ${version} の実装が無い (実装があるのは ${IMPLEMENTED_VERSIONS.join(', ')})`);
}

/** `sha256:<hex>` 形式で返す。sidecar にはこの形式のまま保存する。 */
export function computeFingerprint(text: string, version: number, rewrite?: DestinationRewriter): string {
  const normalized = normalizeForFingerprint(text, version, rewrite);
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * 保存値を、保存した版で計算し直して比べる。
 * - match: 保存した版で今の本文を計算した値が保存値と同じ
 * - mismatch: 同じ版で計算して違う (本文が変わっている)
 * - unverifiable: その版の実装が無く、確かめられない (一致とも不一致ともみなさない)
 */
export type StoredFingerprintMatch = 'match' | 'mismatch' | 'unverifiable';

export function matchStoredFingerprint(stored: string, version: number, text: string, rewrite?: DestinationRewriter): StoredFingerprintMatch {
  if (!isImplementedNormalizationVersion(version)) return 'unverifiable';
  return computeFingerprint(text, version, rewrite) === stored ? 'match' : 'mismatch';
}
