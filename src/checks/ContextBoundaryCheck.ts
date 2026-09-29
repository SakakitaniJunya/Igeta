// まとまり (context) の境界検査。既定 OFF。
// Spec: docs/explanation/07-context-boundaries.md §4
//
// context: A の文書が context: B の文書 (A と違い、shared でもない) を depends_on・本文リンク・
// 修飾 ID で直接参照していたら違反にする。通すのは次の 3 種:
//   1. B の context-contract (kind で判定。どの context の contract かは問わない — 契約 1 枚は
//      「外部に見せてよいもの」として書かれている前提のため)
//   2. 共有文書 (kind ベースの allowlist。既定値は core/IgetaConfig.ts の DEFAULT_SHARED_KINDS、
//      `.igeta.json` の sharedKinds で上書き可)
//   3. 参照元 (A) の context が shared **かつ** kind も共有の kind (sharedKinds) のとき (設計書に
//      明文の記載は無いが、無記入 = shared という §1 の前提から導かれる — 全体の地図 (kind: map、
//      context 無記入) が各まとまりの地図へリンクするのを禁じると §8 の地図網羅検査と矛盾する)。
//      **kind 条件を必ず添える** — context を書き忘れただけの任意の kind の文書まで境界検査を
//      丸ごと免れると、境界検査そのものが機能しなくなる (code-reviewer round 1 non-blocking 2)
//
// context 無記入・kind も共有でない文書 (「未割り当て」) はソースとして検査対象のまま (免除しない)
// だが、移行の進み具合が分かるよう件数・一覧を warnings に出す (違反にはしない)。
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
  #warnings: string[] = [];

  constructor(options: ContextBoundaryCheckOptions = {}) {
    this.#options = options;
  }

  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    this.#warnings = [];
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');
    const configResult = loadIgetaConfig(ctx.targetRoot, this.#options.configPath);
    if ('violation' in configResult) return [configResult.violation];

    const graph = buildContextGraph(ctx.targetRoot, docsDir);
    if (graph === null) return [{ severity: 'cannot-check', message: `docs が無い: ${docsDir}` }];

    const sharedKinds = new Set(configResult.config.sharedKinds);
    const isSharedKind = (kind: string | null): boolean => kind !== null && sharedKinds.has(kind);
    const violations: Violation[] = [];
    const unassigned: ContextDoc[] = [];

    for (const doc of graph.docs) {
      if (doc.context === SHARED_CONTEXT) {
        if (isSharedKind(doc.kind)) continue; // 3. 参照元が shared かつ共有 kind なら境界を持たない
        unassigned.push(doc); // context 無記入・共有 kind でもない → 未割り当て。検査は続ける
      }
      for (const ref of extractReferences(doc, graph, ctx.targetRoot)) {
        const target: ContextDoc = ref.target;
        if (target.context === doc.context) continue;
        if (target.context === SHARED_CONTEXT) continue;
        if (target.kind === 'context-contract') continue; // 1.
        if (isSharedKind(target.kind)) continue; // 2.
        violations.push({
          severity: 'violation',
          file: doc.relPath,
          line: ref.line,
          message: `別のまとまり (${target.context}) の文書を直接参照している: ${target.relPath} (このまとまり: ${doc.context === SHARED_CONTEXT ? '未割り当て' : doc.context})`,
        });
      }
    }

    if (unassigned.length > 0) {
      this.#warnings = [
        `未割り当て (context 無記入・共有 kind でもない) が ${unassigned.length} 件: ${unassigned.map((d) => d.relPath).join(', ')}`,
      ];
    }

    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }
}
