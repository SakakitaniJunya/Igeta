// 設計書のつながりの検査 (ADR-0015、テスト仕様 13)。入力を読み、core/trace/ の関数を呼び、基準を当てるだけ。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import { applyBaseline, BASELINE_FILE, grew, parseBaseline, staleFingerprints } from '../core/trace/Baseline.js';
import { scanTags } from '../core/trace/CodeTags.js';
import type { Finding } from '../core/trace/model/Types.js';
import { checkRulesA } from '../core/trace/RulesA.js';
import { checkRulesB } from '../core/trace/RulesB.js';
import { readTraceConfig, resolveTraceConfig } from '../core/trace/TraceConfig.js';
import { buildIndex } from '../core/trace/TraceIndex.js';
import type { TraceIndex } from '../core/trace/TraceIndex.js';
import { loadCodeFiles, loadDocs } from './TraceLoad.js';
import { readOrigin } from './TraceOrigin.js';

/** 1 回の検査の結果。fresh = 落とす対象 (警告を含む)、baselined = 基準に有る違反 */
export interface TraceResult {
  readonly index: TraceIndex;
  readonly findings: readonly Finding[];
  readonly fresh: readonly Finding[];
  readonly baselined: readonly Finding[];
  /** 基準ファイルの指紋。ファイルが無ければ undefined */
  readonly baseline: readonly string[] | undefined;
  /** 検査が成立しなかった理由 (設定・基準ファイルが読めない)。あれば結果は使えない */
  readonly fatal: readonly Violation[];
  /** 基準が origin より増えている、または増えていないか確かめられない */
  readonly growth: readonly Violation[];
  readonly notes: readonly string[];
}

const emptyResult = (index: TraceIndex, fatal: readonly Violation[] = []): TraceResult =>
  ({ index, findings: [], fresh: [], baselined: [], baseline: undefined, fatal, growth: [], notes: [] });

/** 基準に有る違反の件数を規則ごとに 1 行にまとめる。落とさないが、見えなくはしない */
export function summarizeBaselined(baselined: readonly Finding[]): string[] {
  if (baselined.length === 0) return [];
  const counts = new Map<string, number>();
  for (const finding of baselined) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  return [`baselined ${baselined.length} 件 (${[...counts].map(([rule, count]) => `${rule}: ${count}`).join('、')})`];
}

/** `docs-check` と `igeta trace` が使う、設計書のつながりの検査 */
export class TraceCheck implements Check {
  readonly name = 'trace-check';
  readonly #base: string | undefined;
  #warnings: string[] = [];

  constructor(options: { readonly base?: string } = {}) {
    this.#base = options.base;
  }

  /** 直近の run() の警告 (落とさない指摘)・基準に有る違反の件数 */
  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const result = this.analyze(ctx.targetRoot);
    const toLine = (found: Finding): string => `[${found.rule}] ${found.path}${found.line === undefined ? '' : `:${found.line}`} ${found.id} ${found.message}`;
    this.#warnings = [...result.notes, ...summarizeBaselined(result.baselined), ...result.fresh.filter((found) => found.level === 'warning').map(toLine)];
    const violations = result.fresh.filter((found) => found.level === 'violation').map((found): Violation => ({
      severity: 'violation', message: `[${found.rule}] ${found.id} ${found.message}`, file: found.path, ...(found.line === undefined ? {} : { line: found.line }),
    }));
    return [...result.fatal, ...result.growth, ...violations];
  }

  /** 検査して、違反・警告・基準の適用結果をまとめて返す (書き出しはしない) */
  analyze(root: string): TraceResult {
    const loaded = readTraceConfig(root);
    if ('violation' in loaded) return emptyResult(buildIndex([], resolveTraceConfig({})), [loaded.violation]);
    const { config } = loaded;
    const docs = loadDocs(root);
    const index = buildIndex(docs.inputs, config);
    if (index.definitions.length === 0) return emptyResult(index);
    const base = this.#base ?? config.base;
    const origin = readOrigin(root, base, docs.isV4);
    const originIndexes = 'origin' in origin
      ? { tip: buildIndex(origin.origin.tip.inputs, config), mergeBase: buildIndex(origin.origin.mergeBase.inputs, config) }
      : undefined;
    const tags = scanTags(config.code.length === 0 ? [] : loadCodeFiles(root, [...config.code, ...config.tests]));
    const findings = [...checkRulesA(index, originIndexes), ...checkRulesB(index, tags, config)];
    const baseline = this.#readBaseline(root);
    if ('problem' in baseline) return { ...emptyResult(index, [baseline.problem]), findings };
    const applied = applyBaseline(findings, baseline.fingerprints ?? []);
    const stale = staleFingerprints(baseline.fingerprints ?? [], findings);
    const notes = [
      ...index.notices.map((notice) => `${notice.path} ${notice.message}`),
      ...(config.code.length === 0 ? ['trace.code が空なので、コードの規則 (T7・T8・先頭行の @trace) を見ていない'] : []),
      ...(stale.length > 0 ? [`基準に、もう出ていない違反の指紋が ${stale.length} 件残っている (igeta trace --update-baseline で消す)`] : []),
    ];
    const growth = this.#checkGrowth(base, baseline.fingerprints, origin);
    return { index, findings, ...applied, baseline: baseline.fingerprints, fatal: [], growth, notes };
  }

  #readBaseline(root: string): { readonly fingerprints: readonly string[] | undefined } | { readonly problem: Violation } {
    const path = join(root, BASELINE_FILE);
    if (!existsSync(path)) return { fingerprints: undefined };
    const parsed = parseBaseline(readFileSync(path, 'utf8'));
    if ('error' in parsed) return { problem: { severity: 'cannot-check', message: `${BASELINE_FILE} が読めない: ${parsed.error}`, file: BASELINE_FILE } };
    return { fingerprints: parsed.fingerprints };
  }

  /**
   * origin と照合できなければ cannot-check (T1(b) と基準の増加を確かめられないのに通さない)。
   * 基準は、自分の branch との merge-base の基準と比べる (main が基準を減らしただけでは落ちない)。
   * merge-base に基準が無ければ、初めて基準を入れる変更として通す。
   */
  #checkGrowth(base: string, current: readonly string[] | undefined, origin: ReturnType<typeof readOrigin>): Violation[] {
    if ('error' in origin) {
      return [{ severity: 'cannot-check', message: `${base} と照合できない (T1(b) と基準の増加を確かめられない): ${origin.error}。CI の浅い checkout (fetch-depth: 1) では起きる。actions/checkout に fetch-depth: 0 を付けるか、git fetch origin main をしてから流す。trace.base で比べる先を変えられる` }];
    }
    const before = origin.origin.mergeBase.baseline;
    if (current === undefined || before === undefined || !grew(current, before)) return [];
    return [{ severity: 'violation', message: `基準が ${base} との merge-base より増えている。基準は減らす方向にしか動かせない (igeta trace --update-baseline)`, file: BASELINE_FILE }];
  }
}
