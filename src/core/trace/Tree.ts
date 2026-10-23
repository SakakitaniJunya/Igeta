// `igeta trace <ID>` の木。ID の上流と下流をたどり、○ 相互・△ 片方向・✗ 抜けか未定義 で印を付ける。

import { buildGraph, edgeSides } from './model/Graph.js';
import type { Dangling, Definition, Finding, TraceIndex } from './model/Types.js';

/** ok = 両方向に揃っている、one-way = 片方の行にしか書いてない (T9) */
export type Mark = 'ok' | 'one-way';

export interface TreeNode {
  readonly label: string;
  readonly mark: Mark;
  /** この ID の抜け (T2〜T6) と、欄にあるが定義の無い ID */
  readonly gaps: readonly string[];
  readonly children: readonly TreeNode[];
  /** Mermaid の節の名前に使う、定義の key (`context:ID`) */
  readonly key: string;
}

export interface TreeRoot {
  readonly definition: Definition;
  readonly gaps: readonly string[];
  readonly up: readonly TreeNode[];
  readonly down: readonly TreeNode[];
}

/** 同じ ID が複数の context にあれば、根は複数になる。1 つも無ければ roots は空 */
export interface Tree {
  readonly id: string;
  readonly roots: readonly TreeRoot[];
}

const describeDefinition = (definition: Definition): string => `${definition.token} (${definition.context}) ${definition.path}:${definition.line}`;

/** index から id の木を作る。findings は ✗ の抜けとして根と各 ID に付ける */
export function buildTree(index: TraceIndex, id: string, findings: readonly Finding[]): Tree {
  const graph = buildGraph(index.edges);
  const sides = edgeSides(index.edges);
  const gapsOf = (definition: Definition): string[] => [
    ...findings.filter((found) => found.id === definition.token && found.path === definition.path && /^T[2-6]$/.test(found.rule)).map((found) => `${found.rule}: ${found.message}`),
    ...index.dangling.filter((entry: Dangling) => entry.fromKey === definition.key).map((entry) => `T10: ${entry.token} は定義が無い`),
  ];
  // 1 度展開した節は子を繰り返さない (ひし形のグラフで木が指数的に膨らむのを防ぐ)。根からの向きごとに数える
  const walk = (key: string, direction: 'up' | 'down', expanded: Set<string>): TreeNode[] =>
    (direction === 'up' ? graph.up(key) : graph.down(key)).flatMap((next) => {
      const definition = index.nodes.get(next);
      if (definition === undefined) return [];
      const pair = direction === 'up' ? `${next}|${key}` : `${key}|${next}`;
      const mark: Mark = (sides.get(pair)?.size ?? 0) > 1 ? 'ok' : 'one-way';
      const label = describeDefinition(definition);
      if (expanded.has(next)) return [{ label: `${label} (上と同じ)`, mark, gaps: [], key: next, children: [] }];
      expanded.add(next);
      return [{ label, mark, gaps: gapsOf(definition), key: next, children: walk(next, direction, expanded) }];
    });
  const roots = [...index.nodes.values()]
    .filter((definition) => definition.token === id)
    .map((definition): TreeRoot => ({
      definition,
      gaps: gapsOf(definition),
      up: walk(definition.key, 'up', new Set([definition.key])),
      down: walk(definition.key, 'down', new Set([definition.key])),
    }));
  return { id, roots };
}

const MARKS: Readonly<Record<Mark, string>> = { ok: '○', 'one-way': '△' };

function textLines(nodes: readonly TreeNode[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return nodes.flatMap((node) => [
    `${pad}${MARKS[node.mark]} ${node.label}`,
    ...node.gaps.map((gap) => `${pad}  ✗ ${gap}`),
    ...textLines(node.children, depth + 1),
  ]);
}

function mermaidEdges(parent: string, nodes: readonly TreeNode[], direction: 'up' | 'down'): { edges: string[]; labels: Map<string, string> } {
  const edges: string[] = [];
  const labels = new Map<string, string>();
  for (const node of nodes) {
    const [from, to] = direction === 'up' ? [node.key, parent] : [parent, node.key];
    edges.push(`  ${nodeName(from)} ${node.mark === 'ok' ? '-->' : '-.->'} ${nodeName(to)}`);
    labels.set(node.key, node.label.split(' ')[0] ?? node.key);
    const below = mermaidEdges(node.key, node.children, direction);
    edges.push(...below.edges);
    below.labels.forEach((label, key) => labels.set(key, label));
  }
  return { edges, labels };
}

const nodeName = (key: string): string => `n_${key.replace(/[^A-Za-z0-9]/g, '_')}`;

/** 木を文字にする。text は ○△✗ の字下げ、mermaid は `flowchart TB` (△ は点線) */
export function render(tree: Tree, mode: 'text' | 'mermaid'): string {
  if (mode === 'text') {
    return tree.roots
      .flatMap((root) => [
        describeDefinition(root.definition),
        ...root.gaps.map((gap) => `  ✗ ${gap}`),
        '上流',
        ...textLines(root.up, 1),
        '下流',
        ...textLines(root.down, 1),
      ])
      .join('\n');
  }
  const parts = tree.roots.flatMap((root) => [mermaidEdges(root.definition.key, root.up, 'up'), mermaidEdges(root.definition.key, root.down, 'down')]);
  const labels = new Map(tree.roots.map((root) => [root.definition.key, root.definition.token] as const));
  parts.forEach((part) => part.labels.forEach((label, key) => labels.set(key, label)));
  const declarations = [...labels].map(([key, label]) => `  ${nodeName(key)}["${label}"]`);
  return ['flowchart TB', ...declarations, ...new Set(parts.flatMap((part) => part.edges))].join('\n');
}
