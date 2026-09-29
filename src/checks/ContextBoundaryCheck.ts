// まとまり (context) の境界検査。既定 OFF。
// Spec: docs/explanation/07-context-boundaries.md §4
//
// context: A の文書が context: B の文書 (A と違い、shared でもない) を depends_on・本文リンク・
// 修飾 ID で直接参照していたら違反にする。通すのは次の 3 種:
//   1. B の context-contract (kind で判定。どの context の contract かは問わない — 契約 1 枚は
//      「外部に見せてよいもの」として書かれている前提のため)
//   2. 共有文書 (kind ベースの allowlist。既定値は core/IgetaConfig.ts の DEFAULT_SHARED_KINDS、
//      `.igeta.json` の sharedKinds で上書き可)
//   3. 参照元 (A) 自身が shared のとき (設計書に明文の記載は無いが、無記入 = shared という §1 の
//      前提から導かれる — 全体の地図 (kind: map、context 無記入) が各まとまりの地図へリンクする
//      のを禁じると §8 の地図網羅検査と矛盾するため。07-context-boundaries.md §4 に追記した)
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { extractReferences, buildContextGraph } from '../core/ContextGraph.js';
import type { ContextDoc } from '../core/ContextGraph.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';

export interface ContextBoundaryCheckOptions {
  readonly docsDir?: string;
  readonly configPath?: string;
}

export class ContextBoundaryCheck implements Check {
  readonly name = 'context-boundary-check';

  readonly #options: ContextBoundaryCheckOptions;

  constructor(options: ContextBoundaryCheckOptions = {}) {
    this.#options = options;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');
    const configResult = loadIgetaConfig(ctx.targetRoot, this.#options.configPath);
    if ('violation' in configResult) return [configResult.violation];

    const graph = buildContextGraph(ctx.targetRoot, docsDir);
    if (graph === null) return [{ severity: 'cannot-check', message: `docs が無い: ${docsDir}` }];

    const sharedKinds = new Set(configResult.config.sharedKinds);
    const violations: Violation[] = [];

    for (const doc of graph.docs) {
      if (doc.context === SHARED_CONTEXT) continue; // 3. 参照元が shared なら境界を持たない
      for (const ref of extractReferences(doc, graph, ctx.targetRoot)) {
        const target: ContextDoc = ref.target;
        if (target.context === doc.context) continue;
        if (target.context === SHARED_CONTEXT) continue;
        if (target.kind === 'context-contract') continue; // 1.
        if (target.kind !== null && sharedKinds.has(target.kind)) continue; // 2.
        violations.push({
          severity: 'violation',
          file: doc.relPath,
          line: ref.line,
          message: `別のまとまり (${target.context}) の文書を直接参照している: ${target.relPath} (このまとまり: ${doc.context})`,
        });
      }
    }

    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }
}
