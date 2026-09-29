// 由来の指紋 (SHA256) を計算する。設計 (docs/explanation/04-provenance-and-agreement.md §6) の
// 正規化 5 手順を実装する。目的は「整形だけの変更では指紋が変わらない」こと。
//
// 1. 改行コードを \n に統一 (CRLF→LF)
// 2. 各行の行末の空白を除去
// 3. 連続する空白 (全角スペース含む) を単一の半角スペースに畳む
// 4. 表の区切り線 (`|---|---|` 相当) は固定文字列に正規化し、表の行はセル内容を trim して詰め直す
// 5. 全角・半角の文字そのもの (かな漢字英数記号) は変換しない (3 の空白だけを正規化する)
//
// 正規化ルールを変えたら CURRENT_NORMALIZATION_VERSION を上げる。sidecar の各エントリはこの版を
// 保存しており、今の版と食い違うエントリは `needs-recompute` (既定は警告のみ) になる。

import { createHash } from 'node:crypto';

/** 正規化ルールの版。既存エントリを一斉に stale へ落とさないための識別子 (§6)。 */
export const CURRENT_NORMALIZATION_VERSION = 1;

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

const normalizeLine = (rawLine: string): string => {
  const noTrailingWs = rawLine.replace(/[ \t]+$/, '');
  const trimmed = noTrailingWs.trim();
  if (isTableSeparatorLine(trimmed)) return TABLE_SEPARATOR_CANONICAL;
  if (isTableRowLine(trimmed)) return normalizeTableRow(trimmed);
  return collapseSpaces(noTrailingWs);
};

/** SHA256 の前に適用する正規化。指紋以外の用途 (差分表示等) にも使えるよう単体で export する。 */
export function normalizeForFingerprint(text: string): string {
  const unified = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return unified.split('\n').map(normalizeLine).join('\n');
}

/** `sha256:<hex>` 形式で返す。sidecar にはこの形式のまま保存する。 */
export function computeFingerprint(text: string): string {
  const normalized = normalizeForFingerprint(text);
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
