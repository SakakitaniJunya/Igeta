import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 差分からの追跡 (spec-kit には無い、arch レビューの核心)。既存の tasks 行形式
 * `- [ ] T001 [P] [FN-001] 説明 (path)` の path を使い、「変更ファイル → タスク → FN → REQ」を
 * 機械的に辿る。PR 本文の申告 REQ と突き合わせ、申告に無い影響・申告したが差分が触れていない REQ・
 * タスクに載っていない変更ファイルを明示する。git 呼び出しは CLI 層の責務、このモジュールは
 * 変更ファイルの一覧を受け取るだけの純粋な集計にする (テストで git を要らなくするため)。
 *
 * Spec: templates/docs/guides/03-human-review.md §6
 */

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage', '.git']);
const TASK_LINE_RE = /^-\s*\[[ xX]\]\s*(T\d+)\s*(?:\[P\]\s*)?((?:\[[A-Z0-9-]+\]\s*)*)(.*?)\s*\(([^)]+)\)\s*$/;
const BRACKET_ID_RE = /\[([A-Z]{2,8}-\d{3})\]/g;

interface DocRecord {
  readonly relPath: string;
  readonly kind: string | undefined;
  readonly lines: readonly string[];
}

interface TaskRecord {
  readonly taskId: string;
  readonly refs: readonly string[];
  readonly path: string;
  readonly relPath: string;
}

export interface DiffTraceResult {
  readonly markdown: string;
  /** 修飾できた場合は <doc-id>/REQ-nnn、できない場合は素の REQ-nnn (複数ファイルのローカル採番で曖昧) */
  readonly impactedReqIds: readonly string[];
  /** (a) 申告に無いが影響する REQ。安全側でこれだけを violation にする */
  readonly missingFromDeclaration: readonly string[];
  /** (b) 申告したが差分が触れていない REQ (advisory) */
  readonly declaredButNotTouched: readonly string[];
  /** (c) タスクに載っていない変更ファイル (advisory) */
  readonly untrackedChangedFiles: readonly string[];
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

function readKind(lines: readonly string[]): string | undefined {
  if (lines[0]?.trim() !== '---') return undefined;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') return undefined;
    const matched = /^kind:\s*(\S+)/.exec(line);
    if (matched !== null) return matched[1];
  }
  return undefined;
}

function parseTasks(docs: readonly DocRecord[]): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  for (const doc of docs) {
    if (doc.kind !== 'tasks') continue;
    for (const line of doc.lines) {
      const matched = TASK_LINE_RE.exec(line.trim());
      if (matched === null) continue;
      const [, taskId, refsRaw, , path] = matched;
      const refs = [...(refsRaw ?? '').matchAll(BRACKET_ID_RE)].map((m) => m[1] ?? '');
      tasks.push({ taskId: taskId ?? '', refs, path: (path ?? '').trim(), relPath: doc.relPath });
    }
  }
  return tasks;
}

/** 変更ファイルとタスクの path をゆるく突き合わせる (どちらかがどちらかを含めば一致とみなす) */
function taskTouchesFile(taskPath: string, changedFile: string): boolean {
  if (taskPath === '' ) return false;
  return changedFile === taskPath || changedFile.endsWith(`/${taskPath}`) || taskPath.endsWith(`/${changedFile}`);
}

/** ID トークン (REQ-nnn 等) の定義元 doc を索引する (複数ファイルの重複もそのまま残す) */
function collectDefinedIds(docs: readonly DocRecord[], prefix: string): Map<string, string[]> {
  const homes = new Map<string, string[]>();
  const strict = new RegExp(`\\b${prefix}-\\d{3}\\b`, 'g');
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const token of doc.lines.join('\n').match(strict) ?? []) {
      if (seen.has(token)) continue;
      seen.add(token);
      const list = homes.get(token) ?? [];
      list.push(doc.relPath);
      homes.set(token, list);
    }
  }
  return homes;
}

const toDocId = (relPath: string): string => relPath.replace(/^.*\//, '').replace(/\.md$/, '');

export interface DiffTraceOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
}

export class DiffTraceModule {
  readonly #docsDir: string;
  readonly #root: string;

  constructor(options: DiffTraceOptions) {
    this.#root = options.targetRoot;
    this.#docsDir = options.docsDir ?? join(options.targetRoot, 'docs');
  }

  trace(changedFiles: readonly string[], declaredReqIds: readonly string[]): DiffTraceResult {
    const docs: DocRecord[] = listMarkdown(this.#docsDir).map((file) => {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      return { relPath: relative(this.#root, file), kind: readKind(lines), lines };
    });

    const tasks = parseTasks(docs);
    const reqHomes = collectDefinedIds(docs.filter((d) => d.kind === 'requirements'), 'REQ');
    const fnHomes = collectDefinedIds(docs.filter((d) => d.kind === 'function-list'), 'FN');
    // FN → REQ: FN の定義元ファイル本文にある REQ トークンを「その FN が指す REQ」とみなす
    const reqOfFn = new Map<string, Set<string>>();
    for (const [fn, homes] of fnHomes) {
      const set = new Set<string>();
      for (const home of homes) {
        const doc = docs.find((d) => d.relPath === home);
        if (doc === undefined) continue;
        for (const matched of doc.lines.join('\n').matchAll(/\bREQ-\d{3}\b/g)) set.add(matched[0]);
      }
      reqOfFn.set(fn, set);
    }

    const touchedTasks = tasks.filter((task) => changedFiles.some((file) => taskTouchesFile(task.path, file)));
    const untrackedChangedFiles = changedFiles.filter((file) => !tasks.some((task) => taskTouchesFile(task.path, file)));

    const impactedReqTokens = new Set<string>();
    for (const task of touchedTasks) {
      for (const ref of task.refs) {
        if (ref.startsWith('REQ-')) impactedReqTokens.add(ref);
        else if (ref.startsWith('FN-')) for (const req of reqOfFn.get(ref) ?? []) impactedReqTokens.add(req);
      }
    }

    // 修飾できるものは修飾する。複数ファイルのローカル採番で曖昧なら素のトークンのまま残す (人が確認する)
    const impactedReqIds = [...impactedReqTokens].map((token) => {
      const homes = reqHomes.get(token);
      if (homes === undefined || homes.length === 0) return token;
      if (homes.length === 1) return `${toDocId(homes[0] ?? '')}/${token}`;
      return token; // 曖昧。missingFromDeclaration/declaredButNotTouched の比較では素のトークンとして扱う
    });

    const declaredSet = new Set(declaredReqIds);
    const declaredTokenSet = new Set(declaredReqIds.map((id) => id.split('/')[1] ?? id));
    const missingFromDeclaration = impactedReqIds.filter((id) => {
      const token = id.includes('/') ? (id.split('/')[1] ?? id) : id;
      return !declaredSet.has(id) && !declaredTokenSet.has(token);
    });
    const impactedTokenSet = new Set(impactedReqIds.map((id) => (id.includes('/') ? (id.split('/')[1] ?? id) : id)));
    const declaredButNotTouched = declaredReqIds.filter((id) => {
      const token = id.split('/')[1] ?? id;
      return !impactedTokenSet.has(token);
    });

    return {
      markdown: this.#render(touchedTasks, impactedReqIds, missingFromDeclaration, declaredButNotTouched, untrackedChangedFiles),
      impactedReqIds,
      missingFromDeclaration,
      declaredButNotTouched,
      untrackedChangedFiles,
    };
  }

  #render(
    touchedTasks: readonly TaskRecord[],
    impactedReqIds: readonly string[],
    missingFromDeclaration: readonly string[],
    declaredButNotTouched: readonly string[],
    untrackedChangedFiles: readonly string[],
  ): string {
    const lines: string[] = ['# 差分からの追跡 (review-sheet --diff)', ''];
    lines.push('## 変更ファイル → タスク → FN/REQ', '');
    if (touchedTasks.length === 0) {
      lines.push('_該当するタスクが無い_', '');
    } else {
      for (const task of touchedTasks) {
        lines.push(`- ${task.taskId} (${task.relPath}, ${task.path}) → ${task.refs.join(', ') || '(参照なし)'}`);
      }
      lines.push('');
    }
    lines.push('## 影響する REQ', '');
    lines.push(impactedReqIds.length > 0 ? impactedReqIds.map((id) => `- ${id}`).join('\n') : '_無し_');
    lines.push('');
    lines.push('## (a) 申告に無いが影響する REQ — 要確認 (exit 1 の根拠)', '');
    lines.push(
      missingFromDeclaration.length > 0
        ? missingFromDeclaration.map((id) => `- ${id}`).join('\n')
        : '_無し_',
    );
    lines.push('');
    lines.push('## (b) 申告したが差分が触れていない REQ — advisory', '');
    lines.push(declaredButNotTouched.length > 0 ? declaredButNotTouched.map((id) => `- ${id}`).join('\n') : '_無し_');
    lines.push('');
    lines.push('## (c) タスクに載っていない変更ファイル — advisory', '');
    lines.push(untrackedChangedFiles.length > 0 ? untrackedChangedFiles.map((f) => `- ${f}`).join('\n') : '_無し_');
    lines.push('');
    return lines.join('\n');
  }
}
