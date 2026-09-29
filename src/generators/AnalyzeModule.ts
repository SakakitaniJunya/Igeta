import type { Dirent } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collectRowDefinedTokens } from '../core/IdDefinitions.js';

/**
 * 読み取り専用・非破壊の整合レポート (spec-kit /analyze 相当)。
 * 網羅 (REQ→FN→タスク) ・未決 (OPEN) ・曖昧語・ローカル採番の重複を、人が 45 ファイルを読まずに
 * 穴を見るための 1 枚にする。書き込みは一切しない。
 *
 * Spec: templates/docs/guides/03-human-review.md §5
 */

const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage', '.git']);
const ID_TOKEN_RE = /\b([A-Z]{2,8})-(\d{3})\b/g;
const TASK_LINE_RE = /^-\s*\[[ xX]\]\s*(T\d+)\s*(?:\[P\]\s*)?((?:\[[A-Z0-9-]+\]\s*)*)(.*?)\s*\(([^)]+)\)\s*$/;
const BRACKET_ID_RE = /\[([A-Z]{2,8}-\d{3})\]/g;

/** 曖昧語の既定値。「速い」「適切に」等、検証不能な要件文になりがちな語彙。プロジェクトで上書き可能 */
export const DEFAULT_AMBIGUOUS_WORDS: readonly string[] = [
  '速い',
  '高速',
  '適切に',
  '柔軟に',
  '高性能',
  '使いやすい',
  '十分に',
  '効率的に',
  '迅速に',
  'できるだけ',
  '基本的に',
];

export type Severity = 'critical' | 'warning' | 'info';

export interface AnalyzeFinding {
  readonly id: string;
  readonly kind: string;
  readonly severity: Severity;
  readonly location: string;
  readonly summary: string;
  readonly recommendation: string;
}

export interface AnalyzeResult {
  readonly markdown: string;
  readonly findings: readonly AnalyzeFinding[];
  readonly hasCritical: boolean;
  /** docs/ が無い等、検査自体が成立しない (code-reviewer round 3 C3)。true のとき exit 2 にする */
  readonly cannotCheck: boolean;
}

interface DocRecord {
  readonly relPath: string;
  readonly kind: string | undefined;
  readonly lines: readonly string[];
}

interface TaskRecord {
  readonly taskId: string;
  readonly refs: readonly string[];
  readonly description: string;
  readonly path: string;
  readonly relPath: string;
  readonly line: number;
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

function bodyStartOf(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === '---') return i + 1;
  }
  return 0;
}

/** 定義済み ID (PREFIX-nnn) をトークン→定義元 doc の一覧で索引する (複数ファイルの重複もそのまま残す) */
function collectDefinedIds(docs: readonly DocRecord[], prefix: string): Map<string, string[]> {
  const homes = new Map<string, string[]>();
  for (const doc of docs) {
    // 定義は行頭セル (`| REQ-nnn | ... |`) だけ (code-reviewer 実バグ #3/#7 で共有)。本文中の言及
    // (前提列・対応業務列などでの参照) を定義に数えると、重複採番でもないのに重複扱いになる。
    for (const token of collectRowDefinedTokens(doc.lines, prefix)) {
      const list = homes.get(token) ?? [];
      list.push(doc.relPath);
      homes.set(token, list);
    }
  }
  return homes;
}

interface ParseTasksResult {
  readonly tasks: readonly TaskRecord[];
  /** `- [ ]`/`- [x]` のタスク行に見えるが行形式に一致しなかった行 (non-blocking N-c) */
  readonly parseFailures: readonly { readonly relPath: string; readonly line: number }[];
}

/** タスク行の見た目 (チェックボックス) はあるが、spec-kit の行形式には一致しない行を検出する */
const TASK_MARKER_RE = /^-\s*\[[ xX]\]/;

function parseTasks(docs: readonly DocRecord[]): ParseTasksResult {
  const tasks: TaskRecord[] = [];
  const parseFailures: Array<{ relPath: string; line: number }> = [];
  for (const doc of docs) {
    if (doc.kind !== 'tasks') continue;
    for (let i = 0; i < doc.lines.length; i += 1) {
      const raw = (doc.lines[i] ?? '').trim();
      const matched = TASK_LINE_RE.exec(raw);
      if (matched === null) {
        if (TASK_MARKER_RE.test(raw)) parseFailures.push({ relPath: doc.relPath, line: i + 1 });
        continue;
      }
      const [, taskId, refsRaw, description, path] = matched;
      const refs = [...(refsRaw ?? '').matchAll(BRACKET_ID_RE)].map((m) => m[1] ?? '');
      tasks.push({
        taskId: taskId ?? '',
        refs,
        description: (description ?? '').trim(),
        path: (path ?? '').trim(),
        relPath: doc.relPath,
        line: i + 1,
      });
    }
  }
  return { tasks, parseFailures };
}

function findAmbiguousWords(docs: readonly DocRecord[], words: readonly string[]): AnalyzeFinding[] {
  const findings: AnalyzeFinding[] = [];
  for (const doc of docs) {
    let fence: string | null = null;
    const bodyStart = bodyStartOf(doc.lines);
    for (let i = bodyStart; i < doc.lines.length; i += 1) {
      const line = doc.lines[i] ?? '';
      const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]?.[0];
        if (marker !== undefined) {
          if (fence === null) fence = marker;
          else if (marker === fence) fence = null;
        }
        continue;
      }
      if (fence !== null) continue;
      for (const word of words) {
        if (!line.includes(word)) continue;
        findings.push({
          id: word,
          kind: '曖昧語',
          severity: 'warning',
          location: `${doc.relPath}:${i + 1}`,
          summary: line.trim().slice(0, 80),
          recommendation: `「${word}」を測定可能な基準に言い換える (例: 数値・閾値・具体的な手順)`,
        });
      }
    }
  }
  return findings;
}

export interface AnalyzeOptions {
  readonly targetRoot: string;
  readonly docsDir?: string;
  readonly ambiguousWords?: readonly string[];
}

export class AnalyzeModule {
  readonly #docsDir: string;
  readonly #root: string;
  readonly #ambiguousWords: readonly string[];

  constructor(options: AnalyzeOptions) {
    this.#root = options.targetRoot;
    this.#docsDir = options.docsDir ?? join(options.targetRoot, 'docs');
    this.#ambiguousWords = options.ambiguousWords ?? DEFAULT_AMBIGUOUS_WORDS;
  }

  analyze(): AnalyzeResult {
    // docs/ が無いのに空の結果を緑で返すと「検査した上で問題無し」に見えてしまう (原則 8 サイレント
    // 縮退禁止)。検査自体が成立しないので cannot-check (exit 2) にする (code-reviewer round 3 C3)。
    if (!existsSync(this.#docsDir)) {
      return {
        markdown: `# 整合レポート (igeta analyze)\n\nCANNOT-CHECK docs が無い: ${relative(this.#root, this.#docsDir) || this.#docsDir}\n`,
        findings: [],
        hasCritical: false,
        cannotCheck: true,
      };
    }

    const docs: DocRecord[] = listMarkdown(this.#docsDir).map((file) => {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      return { relPath: relative(this.#root, file), kind: readKind(lines), lines };
    });

    const findings: AnalyzeFinding[] = [];

    // ① 網羅: REQ → FN
    const reqHomes = collectDefinedIds(docs.filter((d) => d.kind === 'requirements'), 'REQ');
    const fnDocs = docs.filter((d) => d.kind === 'function-list');
    const fnHomes = collectDefinedIds(fnDocs, 'FN');
    const reqMentionedInFn = new Set<string>();
    for (const doc of fnDocs) {
      for (const matched of doc.lines.join('\n').matchAll(/\bREQ-\d{3}\b/g)) reqMentionedInFn.add(matched[0]);
    }
    for (const [req, homes] of reqHomes) {
      if (fnDocs.length === 0) break; // FN 文書が 1 本も無いツリーでは網羅を判定できない (cannot-check ではなく単に評価対象外)
      if (!reqMentionedInFn.has(req)) {
        findings.push({
          id: req,
          kind: '網羅 (REQ→FN)',
          severity: 'warning',
          location: homes[0] ?? '',
          summary: `${req} に対応する機能一覧 (FN) が無い`,
          recommendation: `機能一覧に ${req} を対応させる行を足す`,
        });
      }
    }

    // ① 網羅: FN → タスク、タスク → REQ/FN (ダングリング参照)
    const { tasks, parseFailures } = parseTasks(docs);
    if (parseFailures.length > 0) {
      findings.push({
        id: 'タスク行解析失敗',
        kind: 'パース失敗',
        severity: 'warning',
        location: parseFailures.map((f) => `${f.relPath}:${f.line}`).join(', '),
        summary: `${parseFailures.length} 件のタスク行がチェックボックスはあるが行形式に一致しない`,
        recommendation: '`- [ ] T001 [P] [FN-001] 説明 (path)` の形式に直す',
      });
    }
    const fnMentionedInTasks = new Set<string>();
    for (const task of tasks) for (const ref of task.refs) fnMentionedInTasks.add(ref);
    for (const [fn, homes] of fnHomes) {
      if (docs.every((d) => d.kind !== 'tasks')) break; // タスク文書が無いツリーでは評価対象外
      if (!fnMentionedInTasks.has(fn)) {
        findings.push({
          id: fn,
          kind: '網羅 (FN→タスク)',
          severity: 'warning',
          location: homes[0] ?? '',
          summary: `${fn} に対応するタスクが無い`,
          recommendation: `design/tasks/ に ${fn} を参照するタスク行を足す`,
        });
      }
    }
    const knownIds = new Set([...reqHomes.keys(), ...fnHomes.keys()]);
    for (const task of tasks) {
      for (const ref of task.refs) {
        if (!knownIds.has(ref)) {
          findings.push({
            id: task.taskId,
            kind: '網羅 (タスク→存在しない ID)',
            severity: 'critical',
            location: `${task.relPath}:${task.line}`,
            summary: `${task.taskId} が存在しない ID を参照している: ${ref}`,
            recommendation: `${ref} の typo を直すか、要件一覧・機能一覧に ${ref} を足す`,
          });
        }
      }
    }

    // ② 未決 OPEN (decision-log から)
    const decisionDocs = docs.filter((d) => d.kind === 'decision-log');
    const openHomes = collectDefinedIds(decisionDocs, 'OPEN');
    for (const [open, homes] of openHomes) {
      findings.push({
        id: open,
        kind: '未決 (OPEN)',
        severity: 'info',
        location: homes[0] ?? '',
        summary: `${open} は未決のまま`,
        recommendation: '決定したら決定台帳の DEC に移し、参照元の status を確定にする',
      });
    }

    // ③ 曖昧語
    findings.push(...findAmbiguousWords(docs, this.#ambiguousWords));

    // ④ 重複 (ローカル採番)。違反ではなく情報 (修飾 ID で解決できるため)
    for (const prefix of ['REQ', 'FN']) {
      const homes = collectDefinedIds(docs, prefix);
      for (const [token, files] of homes) {
        if (files.length > 1) {
          findings.push({
            id: token,
            kind: '重複 (ローカル採番)',
            severity: 'info',
            location: files.join(', '),
            summary: `${token} が複数の文書で定義されている`,
            recommendation: '欠陥ではない。他ファイルから参照するときは修飾 ID (<doc-id>/PREFIX-nnn) で明示する',
          });
        }
      }
    }

    const hasCritical = findings.some((f) => f.severity === 'critical');
    const coverage = this.#coverageOf(reqHomes, reqMentionedInFn, fnHomes, fnMentionedInTasks, docs);
    return { markdown: this.#render(findings, coverage), findings, hasCritical, cannotCheck: false };
  }

  #coverageOf(
    reqHomes: ReadonlyMap<string, readonly string[]>,
    reqMentionedInFn: ReadonlySet<string>,
    fnHomes: ReadonlyMap<string, readonly string[]>,
    fnMentionedInTasks: ReadonlySet<string>,
    docs: readonly DocRecord[],
  ): readonly string[] {
    const lines: string[] = [];
    const hasFn = docs.some((d) => d.kind === 'function-list');
    const hasTasks = docs.some((d) => d.kind === 'tasks');
    if (hasFn) {
      const covered = [...reqHomes.keys()].filter((r) => reqMentionedInFn.has(r)).length;
      lines.push(`REQ → FN: ${covered}/${reqHomes.size}`);
    } else {
      lines.push('REQ → FN: 評価対象外 (function-list 文書が無い)');
    }
    if (hasTasks) {
      const covered = [...fnHomes.keys()].filter((f) => fnMentionedInTasks.has(f)).length;
      lines.push(`FN → タスク: ${covered}/${fnHomes.size}`);
    } else {
      lines.push('FN → タスク: 評価対象外 (tasks 文書が無い)');
    }
    return lines;
  }

  #render(findings: readonly AnalyzeFinding[], coverage: readonly string[]): string {
    const lines: string[] = ['# 整合レポート (igeta analyze)', ''];
    lines.push('## 網羅率', '');
    for (const c of coverage) lines.push(`- ${c}`);
    lines.push('');
    lines.push('## 所見', '');
    if (findings.length === 0) {
      lines.push('_該当なし_', '');
    } else {
      lines.push('| ID | 種別 | 重大度 | 場所 | 要約 | 推奨 |', '|---|---|---|---|---|---|');
      for (const f of findings) {
        lines.push(`| ${f.id} | ${f.kind} | ${f.severity} | ${f.location} | ${f.summary} | ${f.recommendation} |`);
      }
      lines.push('');
    }
    const critical = findings.filter((f) => f.severity === 'critical');
    const warnings = findings.filter((f) => f.severity === 'warning');
    lines.push('## 次の一手', '');
    if (critical.length > 0) {
      lines.push(`1. critical ${critical.length} 件を先に直す (タスクが存在しない ID を参照している = 実装の追跡が壊れている)`);
    }
    if (warnings.length > 0) {
      lines.push(`${critical.length > 0 ? '2' : '1'}. warning ${warnings.length} 件 (網羅の穴・曖昧語) を優先度順に潰す`);
    }
    if (critical.length === 0 && warnings.length === 0) {
      lines.push('critical・warning は無い。info (未決・ローカル採番の重複) だけ残っている場合はそのまま可');
    }
    lines.push('');
    return lines.join('\n');
  }
}
