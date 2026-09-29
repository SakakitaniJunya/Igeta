import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/**
 * レビューシート生成。人間レビュー層 (docs/00-map.md・docs/01-decisions.md) を前提に、
 * 指定した修飾 ID (<doc-id>/REQ-nnn) の要件文・受入条件・関連 DEC/OPEN・下流の設計書を
 * 1 枚の Markdown に展開する。レビューする人はこれを見ながら PR の差分を読む。
 *
 * Spec: templates/docs/guides/03-human-review.md
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

/** id: / title: / depends_on: だけを読む最小 frontmatter パーサ (この用途に必要な分だけ) */
function parseMinimalFrontmatter(lines: readonly string[]): { id?: string; title?: string; dependsOn: string[]; kind?: string } | null {
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  let id: string | undefined;
  let title: string | undefined;
  let kind: string | undefined;
  const dependsOn: string[] = [];
  let inDependsOn = false;
  for (let i = 1; i < end; i += 1) {
    const raw = lines[i] ?? '';
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item !== null && inDependsOn) {
      dependsOn.push((item[1] ?? '').trim());
      continue;
    }
    inDependsOn = false;
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(raw);
    if (pair === null) continue;
    const key = pair[1];
    const value = (pair[2] ?? '').trim();
    if (key === 'id') id = value;
    else if (key === 'title') title = value;
    else if (key === 'kind') kind = value;
    else if (key === 'depends_on') {
      if (value === '') {
        inDependsOn = true;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim();
        if (inner !== '') dependsOn.push(...inner.split(',').map((v) => v.trim()));
      }
    }
  }
  return { id, title, dependsOn, kind };
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** id トークン (例: REQ-101) が最初の列にある行を見つけ、直近の table 見出し行を header にして返す */
function findTableRow(lines: readonly string[], idToken: string): { headers: readonly string[]; cells: readonly string[] } | null {
  const rowRe = new RegExp(`^\\|\\s*${idToken}\\s*\\|`);
  const rowIndex = lines.findIndex((line) => rowRe.test(line.trim()));
  if (rowIndex === -1) return null;
  let headerIndex = rowIndex;
  while (headerIndex > 0 && (lines[headerIndex - 1] ?? '').trim().startsWith('|')) headerIndex -= 1;
  const headers = splitCells(lines[headerIndex] ?? '');
  const cells = splitCells(lines[rowIndex] ?? '');
  return { headers, cells };
}

/** DEC-nnn / OPEN-nnn の行のうち、target (doc id か qualifiedId) をどこかの列に含む行の生テキストを返す */
function findDecisionRows(decisionLog: DocRecord | undefined, targets: readonly string[]): string[] {
  if (decisionLog === undefined) return [];
  const rows: string[] = [];
  for (const line of decisionLog.lines) {
    const trimmed = line.trim();
    if (!/^\|\s*(DEC|OPEN)-\d{3}\s*\|/.test(trimmed)) continue;
    if (targets.some((t) => trimmed.includes(t))) rows.push(trimmed);
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
      const fm = parseMinimalFrontmatter(lines);
      if (fm === null || fm.id === undefined || fm.id === '') continue;
      const record: DocRecord = {
        relPath: relative(this.#root, file),
        lines,
        title: fm.title,
        dependsOn: fm.dependsOn,
      };
      byId.set(fm.id, record);
      if (fm.kind === 'decision-log') decisionLog = record;
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
    const relatedDecisions = findDecisionRows(decisionLog, [token, qualifiedId]);
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
