// forbid 正規表現を章本文 (frontmatter/AUTOGEN 除去後) に当て、一致した箇所を全件返す。
// 社内 ID (DEC-1 / REQ-1 など) が提出物に漏れるのを防ぐための最終ゲート。1 件でもあれば非 0 終了。

import type { StrippedLine } from './MarkdownStrip.js';

export interface ForbidHit {
  /** 表示用の章ファイルパス (manifest に書かれたまま) */
  readonly file: string;
  readonly line: number;
  readonly word: string;
  /** 一致した forbid 正規表現のソース */
  readonly pattern: string;
}

/** 1 章分の本文を forbid パターン全件でスキャンする。 */
export function scanForbidden(
  file: string,
  lines: readonly StrippedLine[],
  patterns: readonly RegExp[],
  patternSources: readonly string[],
): readonly ForbidHit[] {
  const hits: ForbidHit[] = [];
  for (const { text, line } of lines) {
    for (let i = 0; i < patterns.length; i += 1) {
      const pattern = patterns[i];
      const source = patternSources[i];
      if (pattern === undefined || source === undefined) continue;
      pattern.lastIndex = 0;
      let matched: RegExpExecArray | null = pattern.exec(text);
      while (matched !== null) {
        hits.push({ file, line, word: matched[0], pattern: source });
        if (matched[0] === '') {
          pattern.lastIndex += 1; // 空文字一致での無限ループを防ぐ
        }
        matched = pattern.exec(text);
      }
    }
  }
  return hits;
}

export function formatForbidHit(hit: ForbidHit): string {
  return `${hit.file}:${hit.line}: ${hit.word} (forbid: ${hit.pattern})`;
}
