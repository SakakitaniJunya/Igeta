// context-size: 指定したまとまりの「自分の文書 + 参照している隣の context-contract」の総行数を出す。
// Spec: docs/explanation/07-context-boundaries.md §5
//
// 引数を省略したら全部のまとまりを一覧する。まとまりの地図が 1 枚も無い案件では対象が空になるだけで
// 何も落ちない (既存案件を赤くしない)。

import { join } from 'node:path';
import { extractReferences, buildContextGraph } from '../core/ContextGraph.js';
import type { ContextDoc, ContextGraph } from '../core/ContextGraph.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';

export interface ContextSizeFile {
  readonly relPath: string;
  readonly lines: number;
}

export interface ContextSizeEntry {
  readonly context: string;
  readonly files: readonly ContextSizeFile[];
  readonly totalLines: number;
  readonly limit: number | null;
  readonly overLimit: boolean;
}

export interface ContextSizeResult {
  readonly entries: readonly ContextSizeEntry[];
  readonly violations: readonly Violation[];
}

const countLines = (lines: readonly string[]): number => (lines[lines.length - 1] === '' ? lines.length - 1 : lines.length);

function docsInContext(graph: ContextGraph, context: string): readonly ContextDoc[] {
  return graph.docs.filter((doc) => doc.context === context);
}

/** context 内の全文書が参照している、他まとまりの context-contract を集める (自分の contract は「自分の文書」に含まれる)。 */
function referencedContracts(graph: ContextGraph, targetRoot: string, own: readonly ContextDoc[], context: string): readonly ContextDoc[] {
  const contracts = new Map<string, ContextDoc>();
  for (const doc of own) {
    for (const ref of extractReferences(doc, graph, targetRoot)) {
      if (ref.target.kind === 'context-contract' && ref.target.context !== context) {
        contracts.set(ref.target.relPath, ref.target);
      }
    }
  }
  return [...contracts.values()];
}

function buildEntry(graph: ContextGraph, targetRoot: string, context: string, limit: number | null): ContextSizeEntry {
  const own = docsInContext(graph, context);
  const contracts = referencedContracts(graph, targetRoot, own, context);
  const files = [...own, ...contracts]
    .map((doc): ContextSizeFile => ({ relPath: doc.relPath, lines: countLines(doc.lines) }))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  return { context, files, totalLines, limit, overLimit: limit !== null && totalLines > limit };
}

export interface ContextSizeOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
  readonly configPath?: string;
}

export class ContextSizeModule {
  readonly #options: ContextSizeOptions;

  constructor(options: ContextSizeOptions) {
    this.#options = options;
  }

  /** context 省略なら全部のまとまりを一覧する。 */
  analyze(context?: string): ContextSizeResult {
    const docsDir = this.#options.docsDir ?? join(this.#options.targetRoot, 'docs');
    const configResult = loadIgetaConfig(this.#options.targetRoot, this.#options.configPath);
    if ('violation' in configResult) return { entries: [], violations: [configResult.violation] };

    const graph = buildContextGraph(this.#options.targetRoot, docsDir);
    if (graph === null) return { entries: [], violations: [{ severity: 'cannot-check', message: `docs が無い: ${docsDir}` }] };

    const limit = configResult.config.contextSizeLimit;
    const knownContexts = [...new Set(graph.docs.map((doc) => doc.context))].filter((c) => c !== SHARED_CONTEXT).sort();

    if (context === undefined) {
      const entries = knownContexts.map((c) => buildEntry(graph, this.#options.targetRoot, c, limit));
      const violations = entries.filter((e) => e.overLimit).map(
        (e): Violation => ({ severity: 'violation', message: `まとまり ${e.context} が行数上限 (${e.limit}) を超えている: ${e.totalLines} 行` }),
      );
      return { entries, violations };
    }

    if (!knownContexts.includes(context)) {
      return { entries: [], violations: [{ severity: 'cannot-check', message: `まとまりが存在しない: ${context}` }] };
    }
    const entry = buildEntry(graph, this.#options.targetRoot, context, limit);
    const violations: Violation[] = entry.overLimit
      ? [{ severity: 'violation', message: `まとまり ${entry.context} が行数上限 (${entry.limit}) を超えている: ${entry.totalLines} 行` }]
      : [];
    return { entries: [entry], violations };
  }
}
