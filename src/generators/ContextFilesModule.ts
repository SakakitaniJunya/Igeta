// context-files: AI が読むべきファイル一覧をパスで出す。
// Spec: docs/explanation/07-context-boundaries.md §6
//
// 自分の文書 (context: <name>) + 参照している隣の context-contract + 共有文書。
// 共有文書が多いと短縮にならないので、既定では共有のうち map / glossary / 自分のまとまりの地図
// (自分の文書に含まれるので既に入っている) だけを出し、--with-shared で shared 文書全部を出す。
// この絞り込みは設計書 (07-context-boundaries.md §6) には無い実装判断 — docs に追記した。

import { join } from 'node:path';
import { extractReferences, buildContextGraph } from '../core/ContextGraph.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import type { Violation } from '../core/Report.js';

/** 既定 (--with-shared 無し) で出す共有 kind。それ以外の共有文書は既定では省く。 */
const DEFAULT_SHARED_FILE_KINDS = new Set(['map', 'glossary']);

export interface ContextFilesResult {
  readonly files: readonly string[];
  readonly error: Violation | null;
}

export interface ContextFilesOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
}

export class ContextFilesModule {
  readonly #options: ContextFilesOptions;

  constructor(options: ContextFilesOptions) {
    this.#options = options;
  }

  analyze(context: string, withShared: boolean): ContextFilesResult {
    const docsDir = this.#options.docsDir ?? join(this.#options.targetRoot, 'docs');
    const graph = buildContextGraph(this.#options.targetRoot, docsDir);
    if (graph === null) {
      return { files: [], error: { severity: 'cannot-check', message: `docs が無い: ${docsDir}` } };
    }

    const own = graph.docs.filter((doc) => doc.context === context);
    if (own.length === 0) {
      return { files: [], error: { severity: 'cannot-check', message: `まとまりが存在しない: ${context}` } };
    }

    const files = new Set<string>(own.map((doc) => doc.relPath));

    for (const doc of own) {
      for (const ref of extractReferences(doc, graph, this.#options.targetRoot)) {
        if (ref.target.kind === 'context-contract' && ref.target.context !== context) {
          files.add(ref.target.relPath);
        }
      }
    }

    for (const doc of graph.docs) {
      if (doc.context !== SHARED_CONTEXT) continue;
      if (withShared || (doc.kind !== null && DEFAULT_SHARED_FILE_KINDS.has(doc.kind))) {
        files.add(doc.relPath);
      }
    }

    return { files: [...files].sort(), error: null };
  }
}
