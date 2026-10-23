// 表の行・見出しから、ID・辺・影響の種類・節の見出しを読む。

import { SHARED_CONTEXT } from '../../Context.js';
import { classifyLines } from '../../LineClassifier.js';
import type { MarkdownTable } from '../../MarkdownTable.js';
import type { Dangling, Edge, Heading, ParsedDoc, Resolver } from './Types.js';

export const IMPACT_HEADER = '影響の種類';
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 種類の接頭辞を `(?:A|B)` に束ねる */
export const kindsPattern = (kinds: readonly string[]): string => `(?:${kinds.map(escapeRegExp).join('|')})`;

/** 欄の中の ID。`doc-id/` の修飾つきも読む。全角・3 桁でないものは ID の形ではない */
export function findTokens(cell: string, kinds: readonly string[]): { readonly token: string; readonly docId: string | undefined }[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9/-])(?:([a-z][a-z0-9-]*)/)?(${kindsPattern(kinds)}-\\d{3})(?!\\d)`, 'g');
  return [...cell.matchAll(pattern)].map((matched) => ({ token: matched[2] ?? '', docId: matched[1] }));
}

/** 本文の見出し (コードフェンス・コメントの中は除く) */
export function headingsOf(lines: readonly string[]): Heading[] {
  const kinds = classifyLines(lines);
  const headings: Heading[] = [];
  lines.forEach((line, i) => {
    const matched = kinds[i] === 'body' ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (matched !== null) headings.push({ level: (matched[1] ?? '').length, text: matched[2] ?? '', line: i + 1 });
  });
  return headings;
}

/** 行番号 → 「影響の種類」列の値 */
export function impactByLine(tables: readonly MarkdownTable[]): ReadonlyMap<number, string> {
  const impacts = new Map<number, string>();
  for (const table of tables) {
    const column = table.headers.indexOf(IMPACT_HEADER);
    if (column >= 0) for (const row of table.rows) impacts.set(row.line, row.cells[column] ?? '');
  }
  return impacts;
}

/** key から定義を引く関数を作る。docId があればその文書の context だけ、無ければ同じ context → shared → 1 つだけの context */
export function makeResolver(keys: ReadonlySet<string>, contextOfDocId: ReadonlyMap<string, string>): Resolver {
  return (token, docId, context) => {
    if (docId !== undefined) return pick(keys, `${contextOfDocId.get(docId) ?? ''}:${token}`);
    const near = [`${context}:${token}`, `${SHARED_CONTEXT}:${token}`].find((key) => keys.has(key));
    if (near !== undefined) return near;
    const anywhere = [...keys].filter((key) => key.endsWith(`:${token}`));
    return anywhere.length === 1 ? anywhere[0] : undefined;
  };
}

const pick = (keys: ReadonlySet<string>, key: string): string | undefined => (keys.has(key) ? key : undefined);

/** 1 文書の表の欄から辺を読む。定義の無い ID は dangling に返す */
export function collectDocEdges(parsed: ParsedDoc, kinds: readonly string[], resolve: Resolver): { edges: Edge[]; dangling: Dangling[] } {
  const { input, tables, columns } = parsed;
  const edges: Edge[] = [];
  const dangling: Dangling[] = [];
  for (const row of tables.flatMap((table) => table.rows.map((tableRow) => ({ headers: table.headers, ...tableRow })))) {
    const first = (row.cells[0] ?? '').trim();
    if (!new RegExp(`^${kindsPattern(kinds)}-\\d{3}$`).test(first)) continue;
    const ownKey = `${input.context}:${first}`;
    row.headers.forEach((header, column) => {
      const direction = columns.get(header);
      if (direction === undefined) return;
      for (const { token, docId } of findTokens(row.cells[column] ?? '', kinds)) {
        const target = resolve(token, docId, input.context);
        const position = { path: input.path, line: row.line };
        if (target === undefined) dangling.push({ token, fromKey: ownKey, docRef: input.id === null ? input.path : `${input.context}/${input.id}`, ...position });
        else if (direction === 'up') edges.push({ up: target, down: ownKey, declaredBy: 'down', ...position });
        else edges.push({ up: ownKey, down: target, declaredBy: 'up', ...position });
      }
    });
  }
  return { edges, dangling };
}
