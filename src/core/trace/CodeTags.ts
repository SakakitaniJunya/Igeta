// コードの先頭 1 行にある `@trace ID...` を読む。2 行目以降は見ない (ADR-0015、テスト仕様 13)。

export interface CodeFile {
  readonly path: string;
  readonly lines: readonly string[];
}

/** tagged = ID が 1 件以上、empty = `@trace` だけ (未記入)、absent = 先頭行に `@trace` が無い */
export interface CodeTag {
  readonly path: string;
  readonly tokens: readonly string[];
  readonly state: 'tagged' | 'empty' | 'absent';
}

const TAG_PATTERN = /@trace\b(.*)$/;
const TOKEN_PATTERN = /(?<![A-Za-z0-9-])[A-Z][A-Z0-9]*-\d{3}(?!\d)/g;

/** 各ファイルの先頭行から `@trace` の ID を読む。文字列リテラルや本文中の ID は数えない */
export function scanTags(files: readonly CodeFile[]): CodeTag[] {
  return files.map(({ path, lines }) => {
    const rest = TAG_PATTERN.exec(lines[0] ?? '')?.[1];
    if (rest === undefined) return { path, tokens: [], state: 'absent' };
    const tokens = rest.match(TOKEN_PATTERN) ?? [];
    return { path, tokens, state: tokens.length > 0 ? 'tagged' : 'empty' };
  });
}
