// docs-migrate のリンクの読み取りと書き換え (テスト仕様 07 の M12・M13・M16 C1)。
// 対象は Markdown のリンク `[文字](行き先)` と画像 `![代替](行き先)` だけ。コードフェンス・コードスパン・
// 生成区間 (AUTOGEN) の中は、リンクとして扱わない (書き換えもしない)。
// 指紋の正規化 v3 (core/Fingerprint.ts) と同じ形のリンクを見る。

import { posix } from 'node:path';

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const AUTOGEN_START_RE = /<!--\s*AUTOGEN:[^>]*:start/;
const AUTOGEN_END_RE = /<!--\s*AUTOGEN:[^>]*:end\s*-->/;
const CODE_SPAN_RE = /(?<!`)(`+)(?!`).+?(?<!`)\1(?!`)/g;
// 1 行内。head = `![text](` か `[text](` とその後の `<`、dest = 行き先、tail = `>`・title・閉じ括弧
const LINK_RE = /(!?\[[^\]]*\]\(\s*<?)([^)<>\s]+)(>?(?:\s+"[^"]*")?\s*\))/g;

/** 1 つのリンク (行の中の位置つき)。text は括弧の中の文字 */
export interface LinkHit {
  readonly line: number;
  readonly start: number;
  readonly length: number;
  readonly image: boolean;
  readonly text: string;
  readonly dest: string;
  readonly head: string;
  readonly tail: string;
}

const maskCodeSpans = (line: string): string => line.replace(CODE_SPAN_RE, (span) => ' '.repeat(span.length));

/**
 * 本文のリンクを、出現順に返す。外部 URL・アンカーだけも含む (呼び出し側が選ぶ)。
 * 生成区間とコードフェンスの中は含めない。
 */
export function scanLinkHits(text: string): LinkHit[] {
  const hits: LinkHit[] = [];
  let inFence = false;
  const lines = text.split('\n');
  const generated = autogenMask(lines);
  lines.forEach((line, index) => {
    if (generated[index]) return;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const masked = maskCodeSpans(line);
    for (const match of masked.matchAll(LINK_RE)) {
      const head = match[1] ?? '';
      const dest = match[2] ?? '';
      const start = match.index ?? 0;
      const whole = line.slice(start, start + match[0].length);
      const bracket = /^(!?)\[([^\]]*)\]/.exec(whole);
      hits.push({
        line: index,
        start,
        length: match[0].length,
        image: bracket?.[1] === '!',
        text: bracket?.[2] ?? '',
        dest: line.slice(start + head.length, start + head.length + dest.length),
        head: line.slice(start, start + head.length),
        tail: line.slice(start + head.length + dest.length, start + match[0].length),
      });
    }
  });
  return hits;
}

/**
 * 行ごとに、生成区間 (AUTOGEN の start から end まで) の中か。区間の印の行も true にする。
 * 生成区間の読み飛ばしは、この 1 か所だけで決める (リンクの走査・本文の比べ方・README の区間の外の文章が使う)。
 */
export function autogenMask(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let inside = false;
  for (const line of lines) {
    if (inside) {
      mask.push(true);
      if (AUTOGEN_END_RE.test(line)) inside = false;
      continue;
    }
    if (AUTOGEN_START_RE.test(line) && !AUTOGEN_END_RE.test(line)) {
      inside = true;
      mask.push(true);
      continue;
    }
    mask.push(false);
  }
  return mask;
}

/** 本文の中の生成区間の行を除いた本文 */
export function withoutAutogen(text: string): string {
  const lines = text.split('\n');
  const generated = autogenMask(lines);
  return lines.filter((_, index) => !generated[index]).join('\n');
}

/** リンクの 1 つを、置き換えた文字列にする (null なら残す)。hit は scanLinkHits の結果 */
export type LinkEdit = (hit: LinkHit) => string | null;

/** 行の中の位置で、後ろから順に置き換える (位置がずれないように) */
export function applyLinkEdits(text: string, edit: LinkEdit): { readonly text: string; readonly count: number } {
  const lines = text.split('\n');
  let count = 0;
  const hits = scanLinkHits(text);
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i];
    if (hit === undefined) continue;
    const replacement = edit(hit);
    if (replacement === null) continue;
    const line = lines[hit.line] ?? '';
    lines[hit.line] = line.slice(0, hit.start) + replacement + line.slice(hit.start + hit.length);
    count += 1;
  }
  return { text: lines.join('\n'), count };
}

/** 外部 URL かどうか (`https:` `mailto:` など) */
export const isExternalDest = (dest: string): boolean => SCHEME_RE.test(dest);

/** リンクの行き先のうち、repo の中のファイルを指すもの: `{ path, fragment }`。外部・アンカーだけ・空は null */
export function localTarget(docRepoPath: string, dest: string): { readonly path: string; readonly fragment: string } | null {
  if (dest === '' || isExternalDest(dest) || dest.startsWith('#')) return null;
  const hash = dest.indexOf('#');
  const pathPart = hash === -1 ? dest : dest.slice(0, hash);
  const fragment = hash === -1 ? '' : dest.slice(hash);
  if (pathPart === '') return null;
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const joined = decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(docRepoPath), decoded);
  // 末尾の `/` (フォルダへのリンク) は外す。フォルダの名前で比べる
  const normalized = posix.normalize(joined).replace(/\/+$/, '');
  return { path: normalized === '' ? '.' : normalized, fragment };
}

/**
 * 移動後の文書 (newFrom) から、移動後の対象 (newTarget) へのリンクの行き先。元の行き先の書き方 (`/` 始まり・`./`)
 * をなるべく保つ。
 */
export function relativeDest(originalDest: string, newFrom: string, newTarget: string, fragment: string): string {
  const body = originalDest.startsWith('/')
    ? `/${newTarget}`
    : posix.relative(posix.dirname(newFrom), newTarget) || posix.basename(newTarget);
  const prefixed = !originalDest.startsWith('/') && originalDest.startsWith('./') && !body.startsWith('.') ? `./${body}` : body;
  return `${prefixed}${fragment}`;
}

/**
 * 型の比べ方 (テスト仕様 07 の M16 C5): 行き先を除いた本文。リンクは `[文字]()` の形にし、生成区間は除く。
 * 行末の空白は無視する。frontmatter は呼び出し側が本文 (bodyStart 以降) だけを渡す。
 */
export function bodyShapeForCompare(body: string): string {
  const edited = applyLinkEdits(withoutAutogen(body), (hit) => `${hit.head}${hit.tail}`).text;
  return edited
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}
