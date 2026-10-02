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
// 新しい構成 (docs/person・ai・client のどれかがある) の repo は、上の規則ではなく、置き場所の型のまとまりの階層から
// 導いたまとまりで検査する (#runV4。docs/design/test/specs/04-doc-graph.md の B1〜B5・ADR-0004 決定 3)。
//   - shared の文書は、どのまとまりからも引いてよい。shared の文書が特定のまとまりを引けるのは、kind が
//     map・function-list・permission-matrix・domain-overview・aggregate-map のときだけ (コードに固定する)
//   - 特定のまとまり A から別のまとまり B へは、B の約束 (context-contract) と、地図から地図 (context-map → context-map) だけ
//   - person/decisions/・ai/handbook/・client/ は、参照元にも参照先にもしない (core/ContextGraph.ts が外す)
//   - sharedKinds は読まない (書いてあれば警告 1 件)。「未割り当て」の警告も出さない
//
// context 無記入・kind も共有でない文書 (「未割り当て」) はソースとして検査対象のまま (免除しない)
// だが、移行の進み具合が分かるよう件数・一覧を warnings に出す (違反にはしない)。
// **参照先が未割り当て (context 無記入・共有 kind でもない) でも、kind が共有でなければ違反にする**
// (旧実装は target.context === shared を無条件で免除していたため、参照先が未割り当てなら kind を
// 問わず検査を丸ごと免れていた。code-reviewer round 2 blocker 1)。未割り当て同士 (両方 shared) は
// 「同じまとまり」と同義に扱う既存の等値判定でそのまま通る (既存案件を赤くしない挙動は変えない)。
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { extractReferences, buildContextGraph } from '../core/ContextGraph.js';
import type { ContextDoc, ContextGraph } from '../core/ContextGraph.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import type { IgetaConfig } from '../core/IgetaConfig.js';
import { DEFAULT_SHARED_KINDS, loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';

/** 新しい構成で、shared の文書が特定のまとまりの文書を引いてよい kind (ADR-0004 決定 3 の 3。設定では変えられない) */
const SHARED_SOURCE_KINDS: ReadonlySet<string> = new Set(['map', 'function-list', 'permission-matrix', 'domain-overview', 'aggregate-map']);

const SHARED_KINDS_WARNING =
  '.igeta.json の sharedKinds は、新しい構成では読まない (shared/ の文書が共有で、特定のまとまりを引ける kind はコードに固定。ADR-0004 決定 3)。次のメジャー版で廃止する';

/** 新しい構成の境界の違反の文 (B3・B4)。通すなら null */
function boundaryMessageV4(source: ContextDoc, target: ContextDoc): string | null {
  if (target.context === source.context) return null; // 同じまとまり (shared 同士を含む)
  if (target.context === SHARED_CONTEXT) return null; // shared の文書は、どのまとまりからも引いてよい
  if (source.context === SHARED_CONTEXT) {
    if (source.kind !== null && SHARED_SOURCE_KINDS.has(source.kind)) return null; // B4
    return `shared の文書が、特定のまとまり (${target.context}) の文書を直接参照している: ${target.relPath} (引けるのは kind が ${[...SHARED_SOURCE_KINDS].join('・')} の文書だけ)`;
  }
  if (target.kind === 'context-contract') return null; // B3: 相手のまとまりの約束
  if (source.kind === 'context-map' && target.kind === 'context-map') return null; // B3: 地図から地図
  return `別のまとまり (${target.context}) の文書を直接参照している: ${target.relPath} (このまとまり: ${source.context})`;
}

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
    if (graph.v4) return this.#runV4(ctx, graph, configResult.config);

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
        if (target.kind === 'context-contract') continue; // 1.
        if (isSharedKind(target.kind)) continue; // 2.
        const sourceLabel = doc.context === SHARED_CONTEXT ? '未割り当て' : doc.context;
        const message =
          target.context === SHARED_CONTEXT
            ? `参照先が未割り当て (context 無記入・共有 kind でもない): ${target.relPath} (このまとまり: ${sourceLabel})`
            : `別のまとまり (${target.context}) の文書を直接参照している: ${target.relPath} (このまとまり: ${sourceLabel})`;
        violations.push({ severity: 'violation', file: doc.relPath, line: ref.line, message });
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

  #runV4(ctx: CheckContext, graph: ContextGraph, config: IgetaConfig): readonly Violation[] {
    // sharedKinds は読まない。IgetaConfig は、書かれていなければ DEFAULT_SHARED_KINDS そのもの (同じ配列) を返す
    if (config.sharedKinds !== DEFAULT_SHARED_KINDS) this.#warnings = [SHARED_KINDS_WARNING];
    const violations: Violation[] = [];
    for (const doc of graph.docs) {
      for (const ref of extractReferences(doc, graph, ctx.targetRoot)) {
        const message = boundaryMessageV4(doc, ref.target);
        if (message !== null) violations.push({ severity: 'violation', file: doc.relPath, line: ref.line, message });
      }
    }
    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }
}
