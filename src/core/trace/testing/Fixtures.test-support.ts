// つながりの検査のテストが使う、架空の設計書の組み立て。

import type { Finding } from '../model/Types.js';
import { resolveTraceConfig } from '../TraceConfig.js';
import type { TraceConfig, TraceSettings } from '../TraceConfig.js';
import { checkRulesA } from '../RulesA.js';
import { checkRulesB } from '../RulesB.js';
import type { CodeTag } from '../CodeTags.js';
import { buildIndex } from '../TraceIndex.js';
import type { TraceDocInput, TraceIndex } from '../TraceIndex.js';

export interface DocSpec {
  readonly path: string;
  readonly id?: string;
  readonly context?: string;
  readonly columns?: readonly string[];
  readonly bands?: readonly string[];
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly heading?: string;
}

/** 表 1 つの文書。columns を省くと trace_columns を宣言しない文書になる */
export function makeDoc(spec: DocSpec): TraceDocInput {
  const frontmatter = [
    '---',
    `id: ${spec.id ?? spec.path}`,
    'kind: function-list',
    ...(spec.columns === undefined ? [] : [`trace_columns: [${spec.columns.map((c) => `"${c}"`).join(', ')}]`]),
    ...(spec.bands === undefined ? [] : [`trace_bands: [${spec.bands.map((b) => `"${b}"`).join(', ')}]`]),
    '---',
  ];
  const table = [
    `| ${spec.headers.join(' | ')} |`,
    `|${spec.headers.map(() => '---').join('|')}|`,
    ...spec.rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  const lines = [...frontmatter, '', '# 題', '', `## ${spec.heading ?? '一覧'}`, '', ...table, ''];
  return { path: spec.path, id: spec.id ?? spec.path, context: spec.context ?? 'shared', lines };
}

type Rows = Partial<Record<'dec' | 'req' | 'fn' | 'scr' | 'api', readonly (readonly string[])[]>>;

/** DEC → REQ → FN → SCR・API が両方向で揃った世界。rows で表の行を差し替える */
export function makeWorld(rows: Rows = {}): TraceDocInput[] {
  const doc = (path: string, headers: string[], columns: string[], defaults: string[][], key: keyof Rows): TraceDocInput =>
    makeDoc({ path: `docs/${path}.md`, id: path, headers, columns, rows: rows[key] ?? defaults });
  return [
    doc('dec', ['ID', '影響の種類', '下流 REQ'], ['下流 REQ:down'], [['DEC-001', '作る物', 'REQ-101']], 'dec'),
    doc('req', ['ID', '上流 DEC', '下流 FN'], ['上流 DEC:up', '下流 FN:down'], [['REQ-101', 'DEC-001', 'FN-010']], 'req'),
    doc('fn', ['ID', '上流 REQ', '下流 SCR', '下流 API'], ['上流 REQ:up', '下流 SCR:down', '下流 API:down'], [['FN-010', 'REQ-101', 'SCR-101', 'API-001']], 'fn'),
    doc('scr', ['ID', '上流 FN'], ['上流 FN:up'], [['SCR-101', 'FN-010']], 'scr'),
    doc('api', ['ID', '上流 FN'], ['上流 FN:up'], [['API-001', 'FN-010']], 'api'),
  ];
}

export const config = (settings: TraceSettings = {}): TraceConfig => resolveTraceConfig(settings);

export function indexOf(docs: readonly TraceDocInput[], settings: TraceSettings = {}): TraceIndex {
  return buildIndex(docs, config(settings));
}

/** T1〜T11 をまとめて走らせる */
export function findAll(docs: readonly TraceDocInput[], options: { settings?: TraceSettings; tags?: readonly CodeTag[]; origin?: readonly TraceDocInput[] } = {}): Finding[] {
  const settings = options.settings ?? {};
  const index = indexOf(docs, settings);
  const originIndex = options.origin === undefined ? undefined : indexOf(options.origin, settings);
  return [...checkRulesA(index, originIndex), ...checkRulesB(index, options.tags ?? [], config(settings))];
}

export const byRule = (findings: readonly Finding[], rule: string): Finding[] => findings.filter((finding) => finding.rule === rule);
