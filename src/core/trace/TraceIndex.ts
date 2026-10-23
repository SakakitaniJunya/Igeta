// 設計書の ID の定義・辺 (上流・下流の宣言)・節の見出しを、文書の一覧から 1 つの索引にまとめる (ADR-0015)。

import { parseFrontmatter, stringList } from '../Frontmatter.js';
import { collectRowDefinitions } from '../IdDefinitions.js';
import { classifyLines } from '../LineClassifier.js';
import { findTables } from '../MarkdownTable.js';
import { collectDocEdges, headingsOf, impactByLine, kindsPattern, makeResolver } from './model/Tables.js';
import type { Dangling, Definition, Edge, Notice, ParsedDoc, TraceDocInput, TraceIndex } from './model/Types.js';
import { parseBandSpecs, parseColumnSpecs } from './TraceConfig.js';
import type { TraceConfig } from './TraceConfig.js';

export type { Definition, Edge, TraceDocInput, TraceIndex } from './model/Types.js';

/** `trace_columns` を宣言した文書だけを読む。宣言の無い文書は undefined (数えない) */
function parseDoc(input: TraceDocInput, config: TraceConfig, notices: Notice[]): ParsedDoc | undefined {
  const meta = parseFrontmatter(input.lines);
  const declaredColumns = meta === null ? [] : stringList(meta.data, 'trace_columns');
  if (meta === null || declaredColumns.length === 0) return undefined;
  const columnSpecs = parseColumnSpecs(config.columns.length > 0 ? config.columns : declaredColumns);
  const bandSpecs = parseBandSpecs(config.bands.length > 0 ? config.bands : stringList(meta.data, 'trace_bands'));
  for (const spec of [...columnSpecs.invalid, ...bandSpecs.invalid]) {
    notices.push({ path: input.path, message: `宣言 "${spec}" が読めない。"名前:up|down" (欄) か "見出し:百の位" (帯) の形で書く` });
  }
  const tables = findTables(input.lines, classifyLines(input.lines), meta.bodyStart);
  const impacts = impactByLine(tables);
  const definitions = collectRowDefinitions(input.lines, kindsPattern(config.kinds)).map(({ token, line }): Definition => ({
    key: `${input.context}:${token}`,
    token,
    kind: token.slice(0, token.lastIndexOf('-')),
    context: input.context,
    path: input.path,
    line,
    impact: impacts.get(line) ?? '',
  }));
  const doc = { path: input.path, bands: bandSpecs.bands, headings: headingsOf(input.lines), definitions };
  return { input, tables, columns: columnSpecs.columns, doc };
}

/** 文書の一覧から索引を作る。`trace_columns` を宣言していない文書の ID は数えない */
export function buildIndex(inputs: readonly TraceDocInput[], config: TraceConfig): TraceIndex {
  const notices: Notice[] = [];
  const parsed = inputs.flatMap((input) => parseDoc(input, config, notices) ?? []);
  const definitions = parsed.flatMap((entry) => entry.doc.definitions);
  const nodes = new Map<string, Definition>();
  for (const definition of definitions) if (!nodes.has(definition.key)) nodes.set(definition.key, definition);
  const contextOfDocId = new Map(inputs.flatMap((input) => (input.id === null ? [] : [[input.id, input.context] as const])));
  const resolve = makeResolver(new Set(nodes.keys()), contextOfDocId);
  const collected = parsed.map((entry) => collectDocEdges(entry, config.kinds, resolve));
  const edges: Edge[] = collected.flatMap((entry) => entry.edges);
  const dangling: Dangling[] = collected.flatMap((entry) => entry.dangling);
  return { docs: parsed.map((entry) => entry.doc), definitions, nodes, edges, dangling, notices };
}
