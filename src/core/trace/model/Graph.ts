// 索引の辺を、key ごとの上流・下流に引き直す。宣言した側 (どちらの行の欄か) は問わず、辺があれば届いたものとして数える。

import type { Edge } from './Types.js';

export interface Graph {
  /** key の上流の key */
  up(key: string): readonly string[];
  /** key の下流の key */
  down(key: string): readonly string[];
}

/** 辺の一覧から Graph を作る */
export function buildGraph(edges: readonly Edge[]): Graph {
  const ups = new Map<string, Set<string>>();
  const downs = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, from: string, to: string): void => {
    map.set(from, (map.get(from) ?? new Set<string>()).add(to));
  };
  for (const edge of edges) {
    add(downs, edge.up, edge.down);
    add(ups, edge.down, edge.up);
  }
  return { up: (key) => [...(ups.get(key) ?? [])], down: (key) => [...(downs.get(key) ?? [])] };
}

/** 辺 (上流 key|下流 key) ごとに、どちらの行の欄に書いてあるか。両方なら相互、片方なら片方向 */
export function edgeSides(edges: readonly Edge[]): ReadonlyMap<string, ReadonlySet<'up' | 'down'>> {
  const sides = new Map<string, Set<'up' | 'down'>>();
  for (const edge of edges) {
    const pair = `${edge.up}|${edge.down}`;
    sides.set(pair, (sides.get(pair) ?? new Set<'up' | 'down'>()).add(edge.declaredBy));
  }
  return sides;
}
