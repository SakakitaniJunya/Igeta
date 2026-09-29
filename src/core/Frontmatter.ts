// 設計書の frontmatter (YAML 風の先頭 `---` ブロック) を読む共通パーサ。
// 複数のモジュール (DocTemplateCheck / ReviewSheetModule 等) が同じ書式を読む必要があり、
// 別々に実装すると規約 (行末コメント `# ...` の除去等) が食い違う (code-reviewer 実バグ #2)。
// ここに 1 か所だけ持ち、読む側は必ずこれを使う。

export type FrontmatterValue = string | readonly string[];
export type FrontmatterData = ReadonlyMap<string, FrontmatterValue>;

export interface Frontmatter {
  readonly data: FrontmatterData;
  /** frontmatter ブロックの次行 (0-based index)。本文はここから */
  readonly bodyStart: number;
}

export const unquote = (value: string): string => value.replace(/^["']|["']$/g, '');

export function scalar(data: FrontmatterData, key: string): string | undefined {
  const value = data.get(key);
  return typeof value === 'string' ? value : undefined;
}

export function stringList(data: FrontmatterData, key: string): readonly string[] {
  const value = data.get(key);
  return Array.isArray(value) ? value : [];
}

/**
 * frontmatter の scalar と list (inline `[]` / ブロック `-`) を読む。行末の `# コメント` は
 * 値の一部にしない (`id: tenancy  # 例: tenancy` のような記入例コメントを id に含めてしまうと、
 * 別モジュールでの id 照合が全部ズレる)。
 */
export function parseFrontmatter(lines: readonly string[]): Frontmatter | null {
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const data = new Map<string, string | string[]>();
  let listKey: string | null = null;
  for (let i = 1; i < end; i += 1) {
    const raw = (lines[i] ?? '').replace(/\s+#\s.*$/, '');
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item !== null && listKey !== null) {
      const current = data.get(listKey);
      if (Array.isArray(current)) current.push(unquote((item[1] ?? '').trim()));
      continue;
    }
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(raw);
    if (pair === null) continue;
    const key = pair[1];
    if (key === undefined) continue;
    const value = (pair[2] ?? '').trim();
    if (value === '') {
      listKey = key;
      data.set(key, []);
      continue;
    }
    listKey = null;
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data.set(key, inner === '' ? [] : inner.split(',').map((v) => unquote(v.trim())));
    } else {
      data.set(key, unquote(value));
    }
  }
  return { data, bodyStart: end + 1 };
}
