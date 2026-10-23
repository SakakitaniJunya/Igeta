// ADR の本文指紋 (テスト仕様 10 の「本文指紋」と DS6)。本文 = frontmatter と履歴の節を除いた部分を、
// ADR-0007 の正規化 v3 で SHA256 にする。リンクは文書 id か repo ルートからのパスで数えるので、移動しても変わらない。

import { join } from 'node:path';
import { CURRENT_NORMALIZATION_VERSION, computeFingerprint } from '../Fingerprint.js';
import { parseFrontmatter } from '../Frontmatter.js';
import type { LinkTable } from '../LinkTable.js';
import { buildLinkTable } from '../LinkTable.js';
import { buildSourceIndex } from '../SourceResolver.js';
import type { Finding, HistoryRow } from './history.js';
import { parseHistory } from './history.js';

/** 本文: frontmatter と `## 承認の履歴` の節 (次の `## ` 見出しまで) を除いた行 */
export function decisionBody(text: string): string {
  const lines = text.split('\n');
  const bodyStart = parseFrontmatter(lines)?.bodyStart ?? 0;
  const history = parseHistory(lines);
  return lines
    .filter((_, index) => index >= bodyStart && (history.startIndex === -1 || index < history.startIndex || index >= history.endIndex))
    .join('\n');
}

/**
 * root の木で本文指紋を計算する関数。リンクの表 (docs/ の索引と実在するファイル) は、最初に使うときに 1 回だけ作る。
 * relPath は root からの相対パス (リンクの解決の起点)。木が変わったら作り直す。
 */
export function fingerprinter(root: string): (relPath: string, text: string) => string {
  let table: LinkTable | undefined;
  return (relPath, text) => {
    table ??= buildLinkTable(root, buildSourceIndex(root, join(root, 'docs')));
    return computeFingerprint(decisionBody(text), CURRENT_NORMALIZATION_VERSION, table.rewriterFor(relPath));
  };
}

/** 1 回だけ計算するとき。何度も使うなら fingerprinter を使う */
export const decisionFingerprint = (root: string, relPath: string, text: string): string => fingerprinter(root)(relPath, text);

const SEALED_STATUSES: ReadonlySet<string> = new Set(['accepted', 'amended', 'rejected']);

/** DS6: 承認・改訂・却下の後は本文を変えない。対象は承認・改訂・却下の行だけで、移行前の行は含まない (DS9) */
export function checkBodyUnchanged(args: { readonly status: string; readonly rows: readonly HistoryRow[]; readonly fingerprint: string }): Finding[] {
  const sealing = args.rows.filter((row) => ['承認', '改訂', '却下'].includes(row.event)).at(-1);
  if (!SEALED_STATUSES.has(args.status) || sealing === undefined || sealing.fingerprint === args.fingerprint) return [];
  return [{ rule: 'DS6', line: sealing.line, message: `承認後に本文が変わった (現在 ${args.fingerprint.slice(0, 19)}… / 履歴 ${sealing.fingerprint.slice(0, 19)}…)。直し方は decision-amend` }];
}
