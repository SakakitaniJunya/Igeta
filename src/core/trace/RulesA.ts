// T1〜T6: 重複と、決定 → 要件 → 機能 → 画面・API の抜け (テスト仕様 13 の §0)。

import { buildGraph } from './model/Graph.js';
import type { Graph } from './model/Graph.js';
import type { Definition, Finding, RuleId, TraceIndex } from './model/Types.js';

interface Context {
  readonly index: TraceIndex;
  readonly graph: Graph;
  readonly kindOf: (key: string) => string;
}

const violation = (rule: RuleId, definition: Definition, message: string, detail = ''): Finding => ({
  rule,
  level: 'violation',
  id: definition.token,
  path: definition.path,
  docRef: definition.docRef,
  line: definition.line,
  message,
  detail,
});

/** (a) 同じ context の中の重複。2 件目以降を指摘する */
function duplicates(index: TraceIndex): Finding[] {
  const first = new Map<string, Definition>();
  const counts = new Map<string, number>();
  const found: Finding[] = [];
  for (const definition of index.definitions) {
    const earlier = first.get(definition.key);
    const occurrence = (counts.get(definition.key) ?? 0) + 1;
    counts.set(definition.key, occurrence);
    // 詳細に出現の順番を入れ、3 つ目以降の重複が基準に記録された 1 件に隠れないようにする
    if (earlier === undefined) first.set(definition.key, definition);
    else found.push(violation('T1', definition, `${definition.token} が同じ context に ${occurrence} 回定義されている (最初は ${earlier.path}:${earlier.line})`, `${earlier.docRef}#${occurrence}`));
  }
  return found;
}

/**
 * (b) 自分の差分で増えた ID (merge-base に無い) が、origin の先端の同じ context に既にある。
 * 文書の移動は merge-base にも有るので足された ID に数えず、別 branch が同じ表に同じ番号を足した場合は衝突になる。
 */
function collisions(index: TraceIndex, origin: OriginIndexes): Finding[] {
  return index.definitions.flatMap((definition) => {
    const earlier = origin.tip.nodes.get(definition.key);
    if (origin.mergeBase.nodes.has(definition.key) || earlier === undefined) return [];
    return [violation('T1', definition, `${definition.token} は origin に ${earlier.path}:${earlier.line} で定義済み (別 branch の採番と衝突)`, `origin:${earlier.docRef}`)];
  });
}

/** key の neighbors のうち、種類が kinds のどれかの物があるか */
const hasNeighbor = (ctx: Context, keys: readonly string[], kinds: readonly string[]): boolean => keys.some((key) => kinds.includes(ctx.kindOf(key)));

/** 上流をたどって (FN・REQ だけを通って) DEC に届くか */
function reachesDecision(ctx: Context, start: string): boolean {
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
    for (const upKey of ctx.graph.up(key)) {
      if (ctx.kindOf(upKey) === 'DEC') return true;
      if (!seen.has(upKey) && ['FN', 'REQ'].includes(ctx.kindOf(upKey))) {
        seen.add(upKey);
        queue.push(upKey);
      }
    }
  }
  return false;
}

function apiReachesScreenOrDecision(ctx: Context, key: string): boolean {
  const ups = ctx.graph.up(key);
  const functions = ups.filter((upKey) => ctx.kindOf(upKey) === 'FN');
  return hasNeighbor(ctx, ups, ['SCR']) || functions.some((functionKey) => hasNeighbor(ctx, ctx.graph.down(functionKey), ['SCR'])) || reachesDecision(ctx, key);
}

/** T2〜T6。関わる種類の定義が repo に 0 件なら、その規則は検査しない */
function gaps(ctx: Context): Finding[] {
  const exists = (...kinds: string[]): boolean => ctx.index.definitions.some((definition) => kinds.includes(definition.kind));
  const found: Finding[] = [];
  for (const [key, definition] of ctx.index.nodes) {
    const upKeys = ctx.graph.up(key);
    const downKeys = ctx.graph.down(key);
    const add = (rule: RuleId, message: string, detail = ''): void => void found.push(violation(rule, definition, message, detail));
    if (definition.kind === 'DEC' && definition.impact === '作る物' && exists('REQ', 'FN') && !hasNeighbor(ctx, downKeys, ['REQ', 'FN'])) {
      add('T2', '作る物の決定なのに、下流の REQ か FN が無い', 'down:REQ|FN');
    }
    if (definition.kind === 'REQ' && exists('FN') && !hasNeighbor(ctx, downKeys, ['FN'])) add('T3', '下流に FN が無い', 'down:FN');
    if (definition.kind === 'FN' && exists('REQ') && !hasNeighbor(ctx, upKeys, ['REQ'])) add('T4', '上流に REQ が無い', 'up:REQ');
    if (definition.kind === 'FN' && exists('SCR', 'API') && !hasNeighbor(ctx, downKeys, ['SCR', 'API'])) add('T4', '下流に SCR か API が無い', 'down:SCR|API');
    if (definition.kind === 'SCR' && exists('FN') && !hasNeighbor(ctx, upKeys, ['FN'])) add('T5', '上流に FN が無い', 'up:FN');
    if (definition.kind === 'API' && exists('SCR', 'DEC') && !apiReachesScreenOrDecision(ctx, key)) {
      add('T6', '上流が画面にも決定にも届かない (SCR を持つ、上流の FN が SCR を持つ、または DEC に届くのどれか)');
    }
  }
  return found;
}

/** origin の先端と、自分の branch との merge-base の索引 (T1(b) の比べ先) */
export interface OriginIndexes {
  readonly tip: TraceIndex;
  readonly mergeBase: TraceIndex;
}

/** T1〜T6 を検査する。origin が無ければ T1(b) は見ない (呼び出し側が cannot-check にする) */
export function checkRulesA(index: TraceIndex, origin: OriginIndexes | undefined): Finding[] {
  const context: Context = { index, graph: buildGraph(index.edges), kindOf: (key) => index.nodes.get(key)?.kind ?? '' };
  return [...duplicates(index), ...(origin === undefined ? [] : collisions(index, origin)), ...gaps(context)];
}
