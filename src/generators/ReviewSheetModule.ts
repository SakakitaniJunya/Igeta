import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';

/**
 * レビューシート生成。人間レビュー層 (docs/00-map.md・docs/01-decisions.md) を前提に、
 * 指定した修飾 ID (<doc-id>/REQ-nnn) の要件文・受入条件・関連 DEC/OPEN・下流の設計書を
 * 1 枚の Markdown に展開する。レビューする人はこれを見ながら PR の差分を読む。
 *
 * Spec: templates/docs/ai/handbook/how-to/03-human-review.md
 */

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage', '.git']);
const QUALIFIED_ID_RE = /^([a-z][a-z0-9-]*)\/([A-Z]+-\d{3})$/;
/** PR 本文からの抽出用。修飾 ID をゆるく拾う (前後の文字は問わない) */
const QUALIFIED_ID_IN_TEXT_RE = /\b([a-z][a-z0-9-]*)\/([A-Z]+-\d{3})\b/g;

interface DocRecord {
  readonly relPath: string;
  readonly lines: readonly string[];
  readonly title: string | undefined;
  readonly dependsOn: readonly string[];
}

export interface ReviewSheetEntry {
  readonly qualifiedId: string;
  readonly resolved: boolean;
  /** 解決できなかった理由。resolved: true のときは undefined */
  readonly reason?: string;
  readonly docRelPath?: string;
  /** 要件文・受入条件などの列。ヘッダ名 → セルの値 */
  readonly fields?: ReadonlyMap<string, string>;
  readonly relatedDecisions?: readonly string[];
  readonly downstream?: readonly { readonly id: string; readonly relPath: string; readonly title: string }[];
}

export interface ReviewSheetResult {
  readonly markdown: string;
  readonly entries: readonly ReviewSheetEntry[];
  readonly unresolvedCount: number;
}

function listMarkdown(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.name.endsWith('.md')) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * id トークン (例: REQ-101) が最初の列にある行を見つけ、直近の table 見出し行を header にして返す。
 * AUTOGEN 区間 (決定台帳の「仮置き一覧」等) ・HTML コメント・コードフェンスは他文書の行をそのまま
 * 写す索引・例示であって定義ではないため除外する (code-reviewer 実バグ #6。分類は
 * core/LineClassifier.ts の classifyLines に統一し、DocTemplateCheck 側の判定と食い違わないようにする)。
 * 除外しないと、§2 に本物の定義が無い OPEN でも索引の行 (`場所`・`本文` 列) を「定義」として解決
 * してしまい、間違ったフィールドを表示する。
 */
function findTableRow(lines: readonly string[], idToken: string): { headers: readonly string[]; cells: readonly string[] } | null {
  const rowRe = new RegExp(`^\\|\\s*${idToken}\\s*\\|`);
  const kinds = classifyLines(lines);
  let rowIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (kinds[i] !== 'body') continue;
    if (rowRe.test((lines[i] ?? '').trim())) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex === -1) return null;
  let headerIndex = rowIndex;
  while (headerIndex > 0 && (lines[headerIndex - 1] ?? '').trim().startsWith('|')) headerIndex -= 1;
  const headers = splitCells(lines[headerIndex] ?? '');
  const cells = splitCells(lines[rowIndex] ?? '');
  return { headers, cells };
}

/**
 * DEC-nnn / OPEN-nnn の行のうち、対象の REQ を指している行の生テキストを返す。
 * 修飾 ID (`<docId>/<token>`) の完全一致、または**他 doc への修飾参照になっていない**裸の token
 * だけを拾う (code-reviewer 実バグ #5)。裸の token を部分文字列一致で拾うと、`other-doc/REQ-101`
 * のような**別文書**の同番号 REQ への修飾参照まで「この REQ の決定」として混ざってしまう。
 * AUTOGEN 区間 (仮置き一覧の索引行) は他文書の行をそのまま写した索引であって、決定台帳自身が
 * その DEC/OPEN について書いた行ではないため除外する (code-reviewer 実バグ #1)。
 */
function findDecisionRows(decisionLog: DocRecord | undefined, docId: string, token: string): string[] {
  if (decisionLog === undefined) return [];
  const qualifiedRe = new RegExp(`\\b${docId}/${token}\\b`);
  const bareRe = new RegExp(`(?<![A-Za-z0-9-]/)\\b${token}\\b`);
  const kinds = classifyLines(decisionLog.lines);
  const rows: string[] = [];
  for (let i = 0; i < decisionLog.lines.length; i += 1) {
    if (kinds[i] !== 'body') continue;
    const trimmed = (decisionLog.lines[i] ?? '').trim();
    if (!/^\|\s*(DEC|OPEN)-\d{3}\s*\|/.test(trimmed)) continue;
    if (qualifiedRe.test(trimmed) || bareRe.test(trimmed)) rows.push(trimmed);
  }
  return rows;
}

/** PR 本文などから修飾 ID (<doc-id>/PREFIX-nnn) を抜き出す。重複は除く */
export function extractQualifiedIds(text: string): string[] {
  const found = new Set<string>();
  for (const matched of text.matchAll(QUALIFIED_ID_IN_TEXT_RE)) {
    const doc = matched[1];
    const id = matched[2];
    if (doc !== undefined && id !== undefined) found.add(`${doc}/${id}`);
  }
  return [...found];
}

// 正規の修飾 ID (小文字 doc-id + 大文字 PREFIX) に近いが一致しない表記 (大文字 doc-id 等) をゆるく拾う。
// 大文字小文字を無視して抜き出したものを、正規表現の抜き出し結果と比べて差分だけを「近似表記」として残す。
const NEAR_MISS_ID_RE = /\b([A-Za-z][A-Za-z0-9-]*)\/([A-Za-z]+-\d{3})\b/gi;

/**
 * 正規の修飾 ID 形式に一致しない近似表記 (例: `Requirements/REQ-101`) を抜き出す (non-blocking N4)。
 * 黙って無視すると「修飾したつもりが解決されない」ことに気付けないため、警告として可視化する。
 */
export function extractNearMissQualifiedIds(text: string): string[] {
  const exact = new Set(extractQualifiedIds(text));
  const nearMisses = new Set<string>();
  for (const matched of text.matchAll(NEAR_MISS_ID_RE)) {
    const doc = matched[1];
    const id = matched[2];
    if (doc === undefined || id === undefined) continue;
    const raw = `${doc}/${id}`;
    if (exact.has(raw)) continue; // 既に正規表記として抜き出せている
    if (/^[a-z][a-z0-9-]*\/[A-Z]+-\d{3}$/.test(raw)) continue; // 正規表記そのもの (matchAll の別ヒット)
    nearMisses.add(raw);
  }
  return [...nearMisses];
}

export interface ReviewSheetModuleOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
}

export class ReviewSheetModule {
  readonly #docsDir: string;
  readonly #root: string;

  constructor(options: ReviewSheetModuleOptions) {
    this.#root = options.targetRoot;
    this.#docsDir = options.docsDir ?? join(options.targetRoot, 'docs');
  }

  generate(qualifiedIds: readonly string[]): ReviewSheetResult {
    const files = listMarkdown(this.#docsDir);
    const byId = new Map<string, DocRecord>();
    let decisionLog: DocRecord | undefined;
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const fm = parseFrontmatter(lines);
      if (fm === null) continue;
      const id = scalar(fm.data, 'id');
      if (id === undefined || id === '') continue;
      const record: DocRecord = {
        relPath: relative(this.#root, file),
        lines,
        title: scalar(fm.data, 'title'),
        dependsOn: stringList(fm.data, 'depends_on'),
      };
      byId.set(id, record);
      if (scalar(fm.data, 'kind') === 'decision-log') decisionLog = record;
    }

    const entries: ReviewSheetEntry[] = [];
    for (const qualifiedId of qualifiedIds) {
      entries.push(this.#resolveOne(qualifiedId, byId, decisionLog));
    }
    const unresolvedCount = entries.filter((e) => !e.resolved).length;
    return { markdown: this.#render(entries), entries, unresolvedCount };
  }

  #resolveOne(
    qualifiedId: string,
    byId: ReadonlyMap<string, DocRecord>,
    decisionLog: DocRecord | undefined,
  ): ReviewSheetEntry {
    const matched = QUALIFIED_ID_RE.exec(qualifiedId);
    if (matched === null) {
      return { qualifiedId, resolved: false, reason: `修飾 ID の形式が不正 (<doc-id>/PREFIX-nnn ではない): ${qualifiedId}` };
    }
    const docId = matched[1] ?? '';
    const token = matched[2] ?? '';
    const doc = byId.get(docId);
    if (doc === undefined) {
      return { qualifiedId, resolved: false, reason: `doc id が存在しない: ${docId}` };
    }
    const row = findTableRow(doc.lines, token);
    if (row === null) {
      return { qualifiedId, resolved: false, reason: `${token} が ${doc.relPath} に無い`, docRelPath: doc.relPath };
    }
    const fields = new Map<string, string>();
    for (let i = 1; i < row.headers.length; i += 1) {
      const key = row.headers[i];
      const value = row.cells[i];
      if (key !== undefined && value !== undefined) fields.set(key, value);
    }
    const relatedDecisions = findDecisionRows(decisionLog, docId, token);
    const downstream = [...byId.entries()]
      .filter(([, d]) => d.dependsOn.includes(docId))
      .map(([id, d]) => ({ id, relPath: d.relPath, title: d.title ?? basename(d.relPath) }));
    return { qualifiedId, resolved: true, docRelPath: doc.relPath, fields, relatedDecisions, downstream };
  }

  #render(entries: readonly ReviewSheetEntry[]): string {
    const lines: string[] = ['# レビューシート', ''];
    for (const entry of entries) {
      lines.push(`## ${entry.qualifiedId}`, '');
      if (!entry.resolved) {
        lines.push(`**解決できない**: ${entry.reason ?? '不明な理由'}`, '');
        continue;
      }
      lines.push(`**定義ファイル**: \`${entry.docRelPath}\``, '');
      const fields = entry.fields ?? new Map<string, string>();
      if (fields.size > 0) {
        lines.push('| 項目 | 内容 |', '|---|---|');
        for (const [key, value] of fields) lines.push(`| ${key} | ${value === '' ? '(未記入)' : value} |`);
        lines.push('');
      } else {
        lines.push('_項目なし (表の列が無い)_', '');
      }
      lines.push('### 関連 DEC / OPEN', '');
      if ((entry.relatedDecisions ?? []).length > 0) {
        for (const row of entry.relatedDecisions ?? []) lines.push(`- ${row}`);
      } else {
        lines.push('なし (決定台帳に紐づく行が見つからない)');
      }
      lines.push('', '### 下流の設計書', '');
      if ((entry.downstream ?? []).length > 0) {
        for (const d of entry.downstream ?? []) lines.push(`- [${d.title}](${d.relPath}) (\`${d.id}\`)`);
      } else {
        lines.push('なし (この doc id を depends_on する文書が見つからない)');
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}
