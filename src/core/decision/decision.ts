// 決定 (ADR) 1 本の読み取りと frontmatter の書き換え。DecisionDoc は規則 (folder・evidence・check/) が共通で読む形。

import { parseFrontmatter, scalar, stringList } from '../Frontmatter.js';
import type { HistoryRow } from './history.js';
import { parseHistory } from './history.js';

export interface DecisionDoc {
  /** repo ルートからの相対パス (`/` 区切り) */
  readonly path: string;
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly awaiting: string;
  readonly due: string;
  readonly created: string;
  /** frontmatter の proposed・accepted (履歴の無い旧い ADR の日付。索引の代わりの値) */
  readonly proposed: string;
  readonly accepted: string;
  readonly supersedes: readonly string[];
  readonly supersededBy: string;
  readonly reopens: string;
  readonly rows: readonly HistoryRow[];
  readonly text: string;
}

/** ADR の本文を読む。frontmatter が読めない・id が無いものは ADR として扱わない (空の id を返さず、呼び出し側が除く) */
export function parseDecision(path: string, text: string): { readonly doc: DecisionDoc } | { readonly reason: string } {
  const lines = text.split('\n');
  const meta = parseFrontmatter(lines);
  const id = meta === null ? '' : (scalar(meta.data, 'id') ?? '');
  const number = /^adr-(\d{4})/.exec(id)?.[1] ?? '';
  if (meta === null || id === '' || number === '') return { reason: `${path}: frontmatter の id が adr-NNNN-… の形ではない` };
  const field = (key: string): string => scalar(meta.data, key) ?? '';
  return {
    doc: {
      path,
      id,
      number,
      title: field('title'),
      status: field('status'),
      awaiting: field('awaiting'),
      due: field('due'),
      created: field('created'),
      proposed: field('proposed'),
      accepted: field('accepted') === 'null' ? '' : field('accepted'),
      supersedes: stringList(meta.data, 'supersedes'),
      supersededBy: field('superseded_by'),
      reopens: field('reopens'),
      rows: parseHistory(lines).rows,
      text,
    },
  };
}

/** frontmatter の項目を足す・直す・消す (undefined で消す)。他の行は触らない */
export function editFrontmatter(text: string, changes: Readonly<Record<string, string | undefined>>): string {
  const lines = text.split('\n');
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  const head = lines.slice(1, end);
  const kept: string[] = [];
  const pending = new Map(Object.entries(changes));
  let skipItems = false;
  for (const line of head) {
    const key = /^([A-Za-z_][A-Za-z0-9_-]*):/.exec(line)?.[1] ?? '';
    if (skipItems && /^\s+-\s/.test(line)) continue;
    skipItems = false;
    if (!pending.has(key)) {
      kept.push(line);
      continue;
    }
    const value = pending.get(key);
    skipItems = true;
    pending.delete(key);
    if (value !== undefined) kept.push(`${key}: ${value}`);
  }
  for (const [key, value] of pending) if (value !== undefined) kept.push(`${key}: ${value}`);
  return ['---', ...kept, ...lines.slice(end)].join('\n');
}
