// manifest の omitSections (既定 `["関連"]`) に挙げた H2 節を、frontmatter/AUTOGEN 除去後の
// 本文から取り除く。「関連」節は社内向けの上流/下流表であり、提出物にそのまま出すと社内の
// 文書管理事情が漏れるため既定で除く。forbid 検査はこの後段で走らせるので、除いた節の中身は
// forbid にも引っかからないし、どこにも出力されない。

import type { StrippedLine } from './MarkdownStrip.js';

const FENCE_RE = /^\s*(```|~~~)/;
const ATX_HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

/**
 * H2 見出しの文字列が sectionTitles に一致した節を、次の同じ階層以上 (h1/h2) の見出しか
 * 文書末尾まで丸ごと除く。コードフェンス内の `#` は見出しとして扱わない。
 */
export function omitSections(
  lines: readonly StrippedLine[],
  sectionTitles: readonly string[],
): readonly StrippedLine[] {
  if (sectionTitles.length === 0) return lines;
  const titles = new Set(sectionTitles.map((t) => t.trim()));

  const result: StrippedLine[] = [];
  let inFence = false;
  let omitting = false;

  for (const line of lines) {
    if (FENCE_RE.test(line.text)) {
      inFence = !inFence;
      if (!omitting) result.push(line);
      continue;
    }

    if (!inFence) {
      const heading = ATX_HEADING_RE.exec(line.text);
      if (heading !== null) {
        const level = (heading[1] ?? '').length;
        if (level <= 2) {
          const text = (heading[2] ?? '').trim();
          omitting = level === 2 && titles.has(text);
          if (!omitting) result.push(line);
          continue;
        }
      }
    }

    if (!omitting) result.push(line);
  }
  return result;
}
