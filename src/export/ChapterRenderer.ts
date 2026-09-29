// 章 Markdown (frontmatter/AUTOGEN 除去済み) を HTML 化する。
// - 見出し (h1〜h6) に章内一意 → 文書全体一意な id を振り、目次 (h1/h2) を作る
// - 章間リンクは manifest の章一覧内なら PDF 内アンカーへ書き換え、それ以外はリンクを外して
//   文字だけ残し、警告を積む (manifest 外への参照を残さないため)
// - ```mermaid フェンスは <pre class="mermaid"> に変換する。実際の描画はブラウザ側 (HtmlDocument) で行う

import { dirname, resolve } from 'node:path';
import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

export interface ChapterInput {
  /** manifest に書かれたままの相対パス (表示用) */
  readonly relPath: string;
  readonly absPath: string;
  /** frontmatter / AUTOGEN 除去済みの本文 */
  readonly strippedText: string;
}

export interface TocEntry {
  readonly level: number;
  readonly text: string;
  readonly id: string;
}

export interface MermaidBlock {
  readonly id: string;
  readonly chapterRelPath: string;
}

export interface ChapterHtml {
  readonly relPath: string;
  /** この章の先頭 (アンカー無しリンクの着地点) */
  readonly sectionId: string;
  readonly html: string;
}

export interface RenderResult {
  readonly chapters: readonly ChapterHtml[];
  readonly toc: readonly TocEntry[];
  readonly mermaidBlocks: readonly MermaidBlock[];
  /** 外部 / manifest 外 / 未解決アンカーへのリンクを外した警告。fatal ではない */
  readonly warnings: readonly string[];
}

interface Heading {
  readonly id: string;
  readonly slug: string;
  readonly level: number;
  readonly text: string;
}

interface ChapterAnchors {
  readonly sectionId: string;
  readonly headingBySlug: ReadonlyMap<string, string>;
}

interface ParsedChapter {
  readonly relPath: string;
  readonly absPath: string;
  readonly sectionId: string;
  readonly tokens: Token[];
  readonly headings: readonly Heading[];
}

const URI_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const MERMAID_ID_PREFIX = 'mermaid-diagram';

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return slug === '' ? 'section' : slug;
}

/** 見出しに id を振り、目次と章内アンカー表を作る。tokens を直接書き換える (attrSet)。 */
function assignHeadingIds(tokens: readonly Token[], chapterIndex: number): Heading[] {
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || token.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    const level = Number(token.tag.slice(1));
    const text = inline !== undefined && inline.type === 'inline' ? inline.content : '';
    const baseSlug = slugify(text);
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    const id = `chapter-${chapterIndex}-${slug}`;
    token.attrSet('id', id);
    headings.push({ id, slug, level, text });
  }
  return headings;
}

type HrefResolution =
  | { readonly kind: 'internal'; readonly targetId: string }
  | { readonly kind: 'skip'; readonly warning: string };

function resolveHref(
  href: string,
  currentAbsPath: string,
  currentRelPath: string,
  anchorMap: ReadonlyMap<string, ChapterAnchors>,
): HrefResolution {
  if (URI_SCHEME_RE.test(href)) {
    return { kind: 'skip', warning: `外部リンクを除去 (${currentRelPath}): ${href}` };
  }
  // markdown-it の normalizeLink が href をパーセントエンコードするため、見出しスラグ (元テキスト
  // ベース) と突き合わせる前にデコードする。壊れたエスケープは元の文字列のまま扱う。
  const decode = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const hashIndex = href.indexOf('#');
  const pathPart = decode(hashIndex === -1 ? href : href.slice(0, hashIndex));
  const anchor = hashIndex === -1 ? null : decode(href.slice(hashIndex + 1));
  const targetAbsPath = pathPart === '' ? currentAbsPath : resolve(dirname(currentAbsPath), pathPart);
  const entry = anchorMap.get(targetAbsPath);
  if (entry === undefined) {
    return { kind: 'skip', warning: `manifest 外へのリンクを除去 (${currentRelPath}): ${href}` };
  }
  if (anchor === null || anchor === '') {
    return { kind: 'internal', targetId: entry.sectionId };
  }
  const headingId = entry.headingBySlug.get(anchor);
  if (headingId === undefined) {
    return {
      kind: 'skip',
      warning: `リンク先アンカーが見つからないため除去 (${currentRelPath}): ${href}`,
    };
  }
  return { kind: 'internal', targetId: headingId };
}

/** inline トークンの children (フラットな配列。open/close は入れ子にならない) を書き換える。 */
function rewriteInlineChildren(
  children: readonly Token[],
  currentAbsPath: string,
  currentRelPath: string,
  anchorMap: ReadonlyMap<string, ChapterAnchors>,
  warnings: string[],
): Token[] {
  const result: Token[] = [];
  let i = 0;
  while (i < children.length) {
    const token = children[i];
    if (token === undefined) {
      i += 1;
      continue;
    }
    if (token.type !== 'link_open') {
      result.push(token);
      i += 1;
      continue;
    }
    let closeIndex = i + 1;
    while (closeIndex < children.length && children[closeIndex]?.type !== 'link_close') {
      closeIndex += 1;
    }
    const inner = children.slice(i + 1, closeIndex);
    const href = String(token.attrGet('href') ?? '');
    const resolution = resolveHref(href, currentAbsPath, currentRelPath, anchorMap);
    if (resolution.kind === 'internal') {
      token.attrSet('href', `#${resolution.targetId}`);
      const closeToken = children[closeIndex];
      result.push(token, ...inner);
      if (closeToken !== undefined) result.push(closeToken);
    } else {
      warnings.push(resolution.warning);
      result.push(...inner);
    }
    i = closeIndex + 1;
  }
  return result;
}

function rewriteLinks(
  tokens: readonly Token[],
  currentAbsPath: string,
  currentRelPath: string,
  anchorMap: ReadonlyMap<string, ChapterAnchors>,
  warnings: string[],
): void {
  for (const token of tokens) {
    if (token.type === 'inline' && token.children !== null) {
      token.children = rewriteInlineChildren(
        token.children,
        currentAbsPath,
        currentRelPath,
        anchorMap,
        warnings,
      );
    }
  }
}

function createMarkdownIt(mermaidBlocks: MermaidBlock[]): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  const defaultFence =
    md.renderer.rules['fence'] ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules['fence'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token === undefined) return '';
    if (token.info.trim() !== 'mermaid') return defaultFence(tokens, idx, options, env, self);
    const chapterRelPath =
      typeof env === 'object' && env !== null && 'chapterRelPath' in env
        ? String((env as { chapterRelPath: unknown }).chapterRelPath)
        : '';
    const id = `${MERMAID_ID_PREFIX}-${mermaidBlocks.length}`;
    mermaidBlocks.push({ id, chapterRelPath });
    const code = md.utils.escapeHtml(token.content.trim());
    return `<pre class="mermaid" id="${id}">${code}</pre>\n`;
  };
  return md;
}

export function renderChapters(chapters: readonly ChapterInput[]): RenderResult {
  const mermaidBlocks: MermaidBlock[] = [];
  const md = createMarkdownIt(mermaidBlocks);
  const warnings: string[] = [];

  const parsed: ParsedChapter[] = chapters.map((chapter, index) => {
    const tokens = md.parse(chapter.strippedText, {});
    const headings = assignHeadingIds(tokens, index);
    return {
      relPath: chapter.relPath,
      absPath: chapter.absPath,
      sectionId: `chapter-${index}`,
      tokens,
      headings,
    };
  });

  const anchorMap = new Map<string, ChapterAnchors>(
    parsed.map((chapter) => [
      chapter.absPath,
      {
        sectionId: chapter.sectionId,
        headingBySlug: new Map(chapter.headings.map((h) => [h.slug, h.id])),
      },
    ]),
  );

  for (const chapter of parsed) {
    rewriteLinks(chapter.tokens, chapter.absPath, chapter.relPath, anchorMap, warnings);
  }

  const chaptersHtml: ChapterHtml[] = parsed.map((chapter) => ({
    relPath: chapter.relPath,
    sectionId: chapter.sectionId,
    html: md.renderer.render(chapter.tokens, md.options, { chapterRelPath: chapter.relPath }),
  }));

  const toc: TocEntry[] = parsed.flatMap((chapter) =>
    chapter.headings
      .filter((h) => h.level <= 2)
      .map((h) => ({ level: h.level, text: h.text, id: h.id })),
  );

  return { chapters: chaptersHtml, toc, mermaidBlocks, warnings };
}
