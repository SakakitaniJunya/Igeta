// 文書の中の参照を、行番号つきで拾う。新しい構成 (docs/person・ai・client) の「文書のつながり」の検査
// (docs/design/test/specs/04-doc-graph.md の G1〜G4) が使う。
//
// 参照は 4 種 (G2):
//   (a) frontmatter の参照の項目: depends_on・relates_to・supersedes・superseded_by・canonical_for (行は項目の行)
//   (b) リンクと画像 `[…](行き先)`・`![…](行き先)`
//   (c) 参照の形のリンクの定義 `[名前]: 行き先` (脚注の定義 `[^名前]:` は除く)
//   (d) 修飾 ID `<doc-id>/接頭辞-nnn` の doc-id
// (b)〜(d) は本文の行だけを見る: frontmatter・コードフェンス・HTML コメント・生成区間の外 (core/LineClassifier.ts の
// body の行)。インラインコードの中のリンクは参照に数えない。

import { posix } from 'node:path';
import { unquote } from './Frontmatter.js';
import type { LineKind } from './LineClassifier.js';

/** 向き (G1) の対象になる frontmatter の参照の項目 */
export const REFERENCE_KEYS: readonly string[] = ['depends_on', 'relates_to', 'supersedes', 'superseded_by', 'canonical_for'];

export interface FrontmatterReference {
  readonly key: string;
  /** 項目の値 (文書の id。`external:` で始まるものを含む) */
  readonly id: string;
  /** 1 始まりの行番号 */
  readonly line: number;
}

/**
 * frontmatter の参照の項目を、行番号つきで拾う。書き方は core/Frontmatter.ts と同じ: インラインの配列 `[a, b]`・
 * ブロックの配列 (`- a`)・1 つの値。行末の `# コメント` は値に含めない。bodyStart は frontmatter の次の行 (0 始まり)。
 * frontmatter が無ければ (bodyStart が 0) 空。
 */
export function scanFrontmatterReferences(lines: readonly string[], bodyStart: number): readonly FrontmatterReference[] {
  const references: FrontmatterReference[] = [];
  let blockKey: string | null = null;
  for (let i = 1; i < bodyStart - 1; i += 1) {
    const raw = (lines[i] ?? '').replace(/\s+#\s.*$/, '');
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item !== null && blockKey !== null) {
      const id = unquote((item[1] ?? '').trim());
      if (id !== '') references.push({ key: blockKey, id, line: i + 1 });
      continue;
    }
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(raw);
    if (pair === null) continue;
    const key = pair[1] ?? '';
    const value = (pair[2] ?? '').trim();
    blockKey = value === '' ? key : null;
    if (!REFERENCE_KEYS.includes(key) || value === '') continue;
    const values = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1).split(',') : [value];
    for (const entry of values) {
      const id = unquote(entry.trim());
      if (id !== '') references.push({ key, id, line: i + 1 });
    }
  }
  return references;
}

export type BodyReference =
  | { readonly kind: 'link'; readonly destination: string; readonly line: number }
  | { readonly kind: 'definition'; readonly destination: string; readonly line: number }
  | { readonly kind: 'qualified-id'; readonly docId: string; readonly line: number };

const INLINE_CODE_RE = /`[^`]*`/g;
const DEFINITION_RE = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/;
/** 修飾 ID。doc-id の直前が、名前・パスの一部になる文字でないもの (`docs/ai/x/REQ-001` の `x` は doc-id ではない) */
const QUALIFIED_ID_RE = /(?<![A-Za-z0-9_./-])([a-z][a-z0-9-]*)\/[A-Z][A-Z0-9]*-\d{3}(?!\d)/g;

/**
 * 1 行の中のリンクと画像の行き先。`](` ごとに行き先を読む (`[![alt](img)](行き先)` のように入れ子になっても、
 * 内側と外側の両方を拾う)。行き先は `<…>` で囲んでも、囲まなくてもよい (囲まないときは、空白か対応しない `)` まで)。
 */
function linkDestinations(text: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf('](', from);
    if (at === -1) return found;
    from = at + 2;
    let i = from;
    while (text[i] === ' ' || text[i] === '\t') i += 1;
    let destination: string;
    if (text[i] === '<' && text.indexOf('>', i + 1) !== -1) {
      const close = text.indexOf('>', i + 1);
      destination = text.slice(i + 1, close);
    } else {
      let depth = 0;
      let j = i;
      for (; j < text.length; j += 1) {
        const ch = text[j];
        if (ch === '\\') {
          j += 1;
        } else if (ch === ' ' || ch === '\t') {
          break;
        } else if (ch === '(') {
          depth += 1;
        } else if (ch === ')') {
          if (depth === 0) break;
          depth -= 1;
        }
      }
      destination = text.slice(i, j);
    }
    if (destination !== '') found.push(destination);
  }
}

/** 本文の行 (bodyStart から後ろで、分類が body のもの) から、(b)〜(d) の参照を拾う */
export function scanBodyReferences(lines: readonly string[], kinds: readonly LineKind[], bodyStart: number): readonly BodyReference[] {
  const references: BodyReference[] = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (kinds[i] !== 'body') continue;
    const line = lines[i] ?? '';
    const text = line.replace(INLINE_CODE_RE, (code) => ' '.repeat(code.length));
    const definition = DEFINITION_RE.exec(text)?.[1];
    if (definition !== undefined) {
      references.push({ kind: 'definition', destination: definition.replace(/^<|>$/g, ''), line: i + 1 });
    }
    for (const destination of linkDestinations(text)) references.push({ kind: 'link', destination, line: i + 1 });
    for (const matched of line.matchAll(QUALIFIED_ID_RE)) {
      references.push({ kind: 'qualified-id', docId: matched[1] ?? '', line: i + 1 });
    }
  }
  return references;
}

/**
 * リンクの行き先を、repo 直下からのパス (区切りは `/`、末尾の `/` なし) にする。fromRepoPath はリンクを書いた文書の
 * repo 直下からのパス。外部の URL (`https:` `mailto:` など)・アンカーだけ・解決した先が repo の外のときは null。
 * `#見出し` と `?query` は外し、百分率エンコードは戻す。先頭が `/` の行き先は repo 直下から数える。
 */
export function resolveRepoPath(fromRepoPath: string, destination: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(destination)) return null;
  const pathPart = destination.split('#')[0]?.split('?')[0] ?? '';
  if (pathPart === '') return null;
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    // 壊れた百分率エンコード (`%` だけなど) は、そのまま使う
  }
  const joined = decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(fromRepoPath), decoded);
  const normalized = posix.normalize(joined);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
