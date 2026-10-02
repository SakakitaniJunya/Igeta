// 人の文書 (docs/person/・docs/client/) の、型・量・人の目に見えない書き込み口の検査。
// Spec: docs/adr/0002-role-boundary-invariants.md の条件 5〜10、docs/explanation/09-reader-granularity.md §3〜§7、
// 要件定義書 02 §7 (型の検査の区分)。`template-check` の中で動く (DocTemplateCheck が雛形の情報を渡す)。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo だけで動く。旧い構成の repo では何も出さない。
//
// 型 (person/ の文書。型の検査の区分は core/Role.ts の formCheck)
//   - ○ の kind: 決まりの表 (行頭が自分の kind の ID の行を持つ表) が 1 つ以上ある。その行は、最後の列が「状態」で、
//     値が 決定・仮・未決・廃 のどれか (条件 5)
//   - 図が要る kind (map・context-map・business-flow・screen-spec・solution-strategy・as-is-overview): Mermaid の図が
//     1 枚以上 (条件 6)
//   - 行数: ○ の kind は 100 行 (requirements は 150 行) (条件 7)。他の kind の上限は雛形の line_limit で、
//     DocTemplateCheck が見る
// 書き込み口 (person/・client/ の文書。条件 10)
//   - HTML コメントを書かない。AUTOGEN 区間は、生成器が管理する dir-index・adr-index・tentative-index の 3 種だけで、
//     生成器が書く場所 (README.md・decisions/README.md・決定台帳) にだけ置ける。区間は閉じて、入れ子にしない
//   - README.md は、区間の外に frontmatter・見出し・1 行の目的だけを書く
// 量 (条件 8)
//   - まとまりの本文の合計 CONTEXT_CHAR_LIMIT 字、全体共通 (要件 + design/shared/) の合計 SHARED_CHAR_LIMIT 字を超えたら警告。
//     Igeta の版が SIZE_LIMIT_VIOLATION_FROM_MAJOR 以上になったら、同じ指摘を違反にする (検査の強さは構成の実在と
//     Igeta の版だけで決まり、利用 repo の設定では変えられない。ADR-0005。RoleBoundaryCheck の旧い構成の切替と同じ作り)
// 廃の行 (条件 9)
//   - 比べる起点 (base: git の ref。CI では merge-base) があれば、起点で 廃 だった ID の行が、いまも同じ ID で 廃 のまま
//     あることを確かめる (消した・状態を戻した・番号を使い直したら違反)。文書は、移動しても変わらない frontmatter の id で
//     照らす。起点が無くても、同じ文書の中で 廃 の ID が別の行に使われていないことは見る

import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import type { StateRow } from '../core/DecisionRows.js';
import { collectStateRows, DECISION_STATES, STATE_ABOLISHED, STATE_COLUMN, isStateTable } from '../core/DecisionRows.js';
import { isDirectory, listDocFiles } from '../core/DocFiles.js';
import type { Frontmatter } from '../core/Frontmatter.js';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import { GitError, listFilesAtRef, readFileAtRef, resolveCommit } from '../core/GitRef.js';
import type { LineKind } from '../core/LineClassifier.js';
import { classifyLines } from '../core/LineClassifier.js';
import { findTables } from '../core/MarkdownTable.js';
import type { Violation } from '../core/Report.js';
import { detectLayout, isGeneratedIndex, kindOfPath, placementOf, roleOfPath } from '../core/Role.js';
import type { SemVer } from '../core/Version.js';
import { readIgetaVersion } from '../core/Version.js';

/** ○ の kind の 1 本の行数 (ADR-0002 条件 7)。requirements だけ 150 行 */
export const PERSON_LINE_LIMIT = 100;
export const REQUIREMENTS_LINE_LIMIT = 150;

/** まとまり 1 つの本文の合計字数と、全体共通 (要件 + design/shared/) の本文の合計字数 (ADR-0002 条件 8) */
export const CONTEXT_CHAR_LIMIT = 15_000;
export const SHARED_CHAR_LIMIT = 30_000;

/** 合計字数の上限を、警告から違反に上げる Igeta のメジャー版 (ADR-0002 条件 8・ADR-0005 決定 1) */
export const SIZE_LIMIT_VIOLATION_FROM_MAJOR = 1;

/** 生成器が管理する AUTOGEN 区間の名前 (ADR-0002 条件 10) */
const AUTOGEN_NAMES: readonly string[] = ['dir-index', 'adr-index', 'tentative-index'];

/** 全体共通の本文を数える場所 (要件 + design/shared/)。まとまりの名前と取り違えない記号 */
const GLOBAL_GROUP = '';

export interface PersonFormTemplate {
  /** 決まりの行の ID の接頭辞 (雛形の id_prefix・id_prefixes)。○ の kind は 1 つ以上要る */
  readonly idPrefixes: readonly string[];
}

export interface PersonFormOptions {
  /** 検査対象。未指定なら <targetRoot>/docs */
  readonly docsDir?: string;
  /** kind → 雛形の情報。DocTemplateCheck が読み込んだ雛形 */
  readonly templates: ReadonlyMap<string, PersonFormTemplate>;
  /** 廃の行を比べる起点 (git の ref)。CI では merge-base を渡す。無ければ、同じ文書の中だけを見る */
  readonly base?: string;
}

interface PersonDoc {
  /** docs/ からの相対パス (区切りは `/`) */
  readonly rel: string;
  /** targetRoot からの相対パス (違反の file) */
  readonly file: string;
  readonly role: 'person' | 'client';
  readonly isReadme: boolean;
  readonly lines: readonly string[];
  readonly kinds: readonly LineKind[];
  /** frontmatter の次の行 (0 始まり)。frontmatter が無ければ 0 */
  readonly bodyStart: number;
  readonly id: string | undefined;
  /** 置き場所の型と frontmatter から決めた kind。決められない・食い違うときは null */
  readonly kind: string | null;
}

export class PersonFormCheck implements Check {
  readonly name = 'person-form-check';

  readonly #options: PersonFormOptions;
  #warnings: string[] = [];

  constructor(options: PersonFormOptions) {
    this.#options = options;
  }

  /** 直近の run() が出した非ブロッキング警告 (まとまりの合計字数) */
  get warnings(): readonly string[] {
    return this.#warnings;
  }

  run(ctx: CheckContext): readonly Violation[] {
    this.#warnings = [];
    const docsDir = this.#options.docsDir ?? join(ctx.targetRoot, 'docs');
    if (!isDirectory(docsDir)) {
      return [{ severity: 'cannot-check', message: `docs が無い: ${relative(ctx.targetRoot, docsDir)}` }];
    }
    if (detectLayout(docsDir) !== 'v4') return [];

    const docs = this.#loadDocs(ctx, docsDir);
    const violations: Violation[] = [];
    const reportedKinds = new Set<string>();
    for (const doc of docs) {
      violations.push(...checkWritePaths(doc));
      if (doc.role === 'person' && !doc.isReadme && doc.kind !== null) {
        violations.push(...this.#checkForm(doc, reportedKinds));
      }
    }
    violations.push(...this.#checkSize(ctx, docs));
    violations.push(...this.#checkAbolished(ctx, docsDir, docs));
    violations.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
    return violations;
  }

  #loadDocs(ctx: CheckContext, docsDir: string): readonly PersonDoc[] {
    const docs: PersonDoc[] = [];
    for (const rel of listDocFiles(docsDir)) {
      const role = roleOfPath(rel);
      if (role !== 'person' && role !== 'client') continue;
      const abs = join(docsDir, rel);
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      const meta = parseFrontmatter(lines);
      docs.push({
        rel,
        file: relative(ctx.targetRoot, abs),
        role,
        isReadme: isGeneratedIndex(rel),
        lines,
        kinds: classifyLines(lines),
        bodyStart: meta?.bodyStart ?? 0,
        id: meta === null ? undefined : nonEmpty(scalar(meta.data, 'id')),
        kind: resolveKind(rel, meta),
      });
    }
    return docs;
  }

  /** 型の検査 (person/ の文書。kind を決められたもの)。条件 5・6・7 */
  #checkForm(doc: PersonDoc, reportedKinds: Set<string>): readonly Violation[] {
    const kind = doc.kind ?? '';
    const placement = placementOf(kind);
    if (placement === undefined || placement.role !== 'person') return [];
    const violations: Violation[] = [];
    const add = (line: number, message: string): void => {
      violations.push({ severity: 'violation', message, file: doc.file, line });
    };

    if (placement.formCheck === 'full') {
      const template = this.#options.templates.get(kind);
      // 雛形が無い kind は、DocTemplateCheck が未登録の kind として違反にする。ここでは重ねない
      if (template !== undefined) {
        if (template.idPrefixes.length === 0) {
          if (!reportedKinds.has(kind)) {
            reportedKinds.add(kind);
            violations.push({
              severity: 'cannot-check',
              message: `kind: ${kind} の雛形に id_prefix が無く、決まりの行を見分けられない (決まりの表の検査ができない。雛形に ID の接頭辞を足す)`,
            });
          }
        } else {
          checkDecisionTables(doc, template.idPrefixes, add);
        }
      }
      const limit = kind === 'requirements' ? REQUIREMENTS_LINE_LIMIT : PERSON_LINE_LIMIT;
      const total = countLines(doc.lines, doc.kinds);
      if (total > limit) {
        add(1, `人の文書の行数上限 (${limit}) を超えている: ${total} 行 (作り方の詳細は ai/ の文書へ移し、人が決める行だけを残す)`);
      }
    }
    if (placement.needsDiagram && countMermaidDiagrams(doc.lines, doc.bodyStart) === 0) {
      add(1, `図が 1 枚も無い (kind: ${kind} は Mermaid の図 (\`\`\`mermaid) が 1 枚以上要る)`);
    }
    return violations;
  }

  /** まとまりごと・全体共通の本文の合計字数 (条件 8)。上限を超えたら警告。Igeta の版が切替の版以上なら違反 */
  #checkSize(ctx: CheckContext, docs: readonly PersonDoc[]): readonly Violation[] {
    const totals = new Map<string, number>();
    for (const doc of docs) {
      if (doc.role !== 'person' || doc.isReadme) continue;
      const group = sizeGroup(doc.rel);
      if (group === null) continue;
      totals.set(group, (totals.get(group) ?? 0) + countBodyChars(doc.lines, doc.kinds, doc.bodyStart));
    }
    const over = [...totals.entries()]
      .filter(([group, total]) => total > (group === GLOBAL_GROUP ? SHARED_CHAR_LIMIT : CONTEXT_CHAR_LIMIT))
      .sort(([a], [b]) => a.localeCompare(b));
    if (over.length === 0) return [];

    let version: SemVer;
    try {
      version = readIgetaVersion(ctx.igetaRoot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // 版が読めないと、警告で済ませるか違反にするかを決められない。どちらかに倒さず検査不能にする
      return [{ severity: 'cannot-check', message: `Igeta の版を読めないため、本文の合計字数の上限を警告にするか違反にするか決められない: ${detail}` }];
    }
    const asViolation = version.major >= SIZE_LIMIT_VIOLATION_FROM_MAJOR;
    const violations: Violation[] = [];
    for (const [group, total] of over) {
      const isGlobal = group === GLOBAL_GROUP;
      const limit = isGlobal ? SHARED_CHAR_LIMIT : CONTEXT_CHAR_LIMIT;
      const subject = isGlobal ? '全体共通 (person/requirements/ と person/design/shared/)' : `まとまり ${group} (person/design/${group}/)`;
      const message = `${subject} の本文が ${thousands(total)} 字で、上限 ${thousands(limit)} 字を超えている (人が全部読める量に収める)`;
      if (asViolation) {
        violations.push({ severity: 'violation', message, file: `docs/person/design/${isGlobal ? 'shared' : group}` });
      } else {
        this.#warnings.push(`${message}。Igeta ${SIZE_LIMIT_VIOLATION_FROM_MAJOR}.0.0 以降は違反になる`);
      }
    }
    return violations;
  }

  /** 廃の行 (条件 9)。同じ文書の中と、比べる起点があれば起点との比較 */
  #checkAbolished(ctx: CheckContext, docsDir: string, docs: readonly PersonDoc[]): readonly Violation[] {
    const violations: Violation[] = [];
    // 同じ行を、同じ文書の中の検査と起点との比較が二重に指さない
    const reported = new Set<string>();
    const add = (key: string, file: string, line: number, message: string): void => {
      if (reported.has(key)) return;
      reported.add(key);
      violations.push({ severity: 'violation', message, file, line });
    };

    const headRows = new Map<string, Array<{ readonly doc: PersonDoc; readonly row: StateRow }>>();
    for (const doc of docs) {
      if (doc.role !== 'person' || doc.isReadme) continue;
      const rows = stateRowsOf(doc.lines, doc.kinds, doc.bodyStart);
      const byId = new Map<string, StateRow[]>();
      for (const row of rows) {
        if (row.id === null) continue;
        byId.set(row.id, [...(byId.get(row.id) ?? []), row]);
      }
      for (const [id, sameId] of byId) {
        // 廃 の行が元の行。同じ ID の、ほかの行は、番号の使い直し
        const original = sameId.find((row) => row.state === STATE_ABOLISHED);
        if (original === undefined) continue;
        for (const row of sameId) {
          if (row === original) continue;
          add(
            `head:${doc.file}:${row.line}`,
            doc.file,
            row.line,
            `${id} は 廃 の ID (${original.line} 行目) なのに、同じ文書の別の行で使われている (廃の ID の番号を使い直さない)`,
          );
        }
      }
      if (doc.id !== undefined) {
        for (const row of rows) {
          const list = headRows.get(doc.id) ?? [];
          list.push({ doc, row });
          headRows.set(doc.id, list);
        }
      }
    }

    const base = this.#options.base;
    if (base === undefined) return violations;
    const root = ctx.targetRoot;
    const docsRel = relative(root, docsDir).split(sep).join('/');
    if (docsRel.startsWith('..') || isAbsolute(docsRel)) {
      return [
        ...violations,
        { severity: 'cannot-check', message: `--base で比べられるのは、リポジトリの中の docs だけ: ${docsDir}` },
      ];
    }
    try {
      resolveCommit(root, base);
      const prefix = docsRel === '' ? '' : `${docsRel}/`;
      for (const path of listFilesAtRef(root, base, `${prefix}person`)) {
        const rel = path.slice(prefix.length);
        if (!path.endsWith('.md') || isGeneratedIndex(rel)) continue;
        const lines = readFileAtRef(root, base, path).split(/\r?\n/);
        const meta = parseFrontmatter(lines);
        const docId = meta === null ? undefined : nonEmpty(scalar(meta.data, 'id'));
        if (meta === null || docId === undefined) continue;
        for (const old of stateRowsOf(lines, classifyLines(lines), meta.bodyStart)) {
          if (old.id === null || old.state !== STATE_ABOLISHED) continue;
          const now = (headRows.get(docId) ?? []).filter(({ row }) => row.id === old.id);
          const label = `${docId}/${old.id}`;
          if (now.length === 0) {
            add(
              `base:${path}:${old.line}`,
              path,
              old.line,
              `廃の行を消している: ${label} は ${base} で 廃 だったが、いまは行が無い (廃の行は消さず、状態を戻さず、番号を使い直さない)`,
            );
            continue;
          }
          for (const { doc, row } of now) {
            if (row.state === STATE_ABOLISHED) continue;
            add(
              `head:${doc.file}:${row.line}`,
              doc.file,
              row.line,
              `廃の行を戻している: ${label} は ${base} で 廃 だったが、いまは「${row.state}」 (状態を戻さず、番号を使い直さない)`,
            );
          }
        }
      }
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      return [...violations, { severity: 'cannot-check', message: `--base ${base} と比べられない: ${error.message}` }];
    }
    return violations;
  }
}

const nonEmpty = (value: string | undefined): string | undefined => (value === undefined || value === '' ? undefined : value);

/** 置き場所の型と frontmatter の kind から、kind を決める。食い違い・決められないときは null (他の検査が違反にする) */
function resolveKind(rel: string, meta: Frontmatter | null): string | null {
  const declared = meta === null ? undefined : nonEmpty(scalar(meta.data, 'kind'));
  const byPath = kindOfPath(rel);
  if (declared === undefined) return byPath;
  return byPath !== null && byPath !== declared ? null : declared;
}

const stateRowsOf = (lines: readonly string[], kinds: readonly LineKind[], bodyStart: number): readonly StateRow[] =>
  collectStateRows(findTables(lines, kinds, bodyStart));

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------------------------------------------------------------------------
// 型 (条件 5・6・7)
// ---------------------------------------------------------------------------

/** 決まりの表 (行頭が自分の kind の ID の行を持つ表) の検査。条件 5 */
function checkDecisionTables(doc: PersonDoc, prefixes: readonly string[], add: (line: number, message: string) => void): void {
  const ownId = new RegExp(`^(${prefixes.map(escapeRegExp).join('|')}-\\d{3})(?!\\d)`);
  const labels = prefixes.map((prefix) => `${prefix}-nnn`).join('・');
  const tables = findTables(doc.lines, doc.kinds, doc.bodyStart).filter((table) =>
    table.rows.some((row) => ownId.test(row.cells[0] ?? '')),
  );
  if (tables.length === 0) {
    add(1, `決まりの表が 1 つも無い (行頭が ${labels} の行を持つ表が 1 つ以上要る。最後の列は「${STATE_COLUMN}」)`);
    return;
  }
  for (const table of tables) {
    if (!isStateTable(table)) {
      add(
        table.headerLine,
        `決まりの表の最後の列が「${STATE_COLUMN}」ではない (見出し: ${table.headers.join(' | ')})。行頭が ${labels} の行は、最後の列に 状態 (${DECISION_STATES.join('・')}) を持つ`,
      );
      continue;
    }
    for (const row of table.rows) {
      const id = ownId.exec(row.cells[0] ?? '')?.[1];
      if (id === undefined) continue;
      if (row.cells.length !== table.headers.length) {
        add(row.line, `${id} の行の列数 (${row.cells.length}) が見出しの列数 (${table.headers.length}) と違う (最後の列が「${STATE_COLUMN}」になっていない)`);
        continue;
      }
      const state = row.cells[row.cells.length - 1] ?? '';
      if (!DECISION_STATES.includes(state)) {
        add(row.line, `${id} の状態が不正: 「${state}」 (${DECISION_STATES.join('・')}のどれか)`);
      }
    }
  }
}

/** 行数。frontmatter も数える。末尾の改行 1 つと AUTOGEN 区間は数えない (DocTemplateCheck の行数上限と同じ数え方) */
function countLines(lines: readonly string[], kinds: readonly LineKind[]): number {
  let total = lines.length;
  if (lines[lines.length - 1] === '') total -= 1;
  for (const kind of kinds) if (kind === 'autogen') total -= 1;
  return total;
}

/** Mermaid の図 (```mermaid のコードフェンス) の数。ほかのコードフェンスの中にある例は数えない */
function countMermaidDiagrams(lines: readonly string[], bodyStart: number): number {
  let count = 0;
  let open: { readonly marker: string; readonly length: number } | null = null;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const fence = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i] ?? '');
    if (fence === null) continue;
    const run = fence[1] ?? '';
    const info = (fence[2] ?? '').trim();
    if (open === null) {
      open = { marker: run.charAt(0), length: run.length };
      if (/^mermaid(\s|$)/.test(info)) count += 1;
    } else if (run.charAt(0) === open.marker && run.length >= open.length && info === '') {
      open = null;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// 書き込み口 (条件 10)
// ---------------------------------------------------------------------------

const AUTOGEN_COMMENT_RE = /<!--\s*AUTOGEN/;
const AUTOGEN_MARKER_RE = /<!--\s*AUTOGEN:([A-Za-z0-9_-]+):(start|end)(?![A-Za-z0-9_-])/;
const HEADING_RE = /^\s{0,3}#{1,6}(\s|$)/;

/** person/・client/ の文書の、HTML コメント・AUTOGEN 区間・README.md の区間の外の文章 */
function checkWritePaths(doc: PersonDoc): readonly Violation[] {
  const violations: Violation[] = [];
  const add = (line: number, message: string): void => {
    violations.push({ severity: 'violation', message, file: doc.file, line });
  };
  const inside = new Array<boolean>(doc.lines.length).fill(false);

  // AUTOGEN 区間。コードフェンスの中の例は、本物の区間ではない
  let open: { readonly name: string; readonly line: number } | null = null;
  const seen = new Set<string>();
  for (let i = doc.bodyStart; i < doc.lines.length; i += 1) {
    const line = doc.lines[i] ?? '';
    if (doc.kinds[i] === 'code-fence' || !AUTOGEN_COMMENT_RE.test(line)) {
      inside[i] = open !== null;
      continue;
    }
    inside[i] = true;
    const marker = AUTOGEN_MARKER_RE.exec(line);
    const name = marker?.[1];
    const edge = marker?.[2];
    if (name === undefined || edge === undefined) {
      add(i + 1, 'AUTOGEN の印が読めない (生成器が書く形は <!-- AUTOGEN:<名前>:start --> と <!-- AUTOGEN:<名前>:end -->)');
      continue;
    }
    if (edge === 'start') {
      if (open !== null) {
        add(i + 1, `AUTOGEN 区間が入れ子になっている (${open.line} 行目の ${open.name} が閉じていない)`);
        continue;
      }
      open = { name, line: i + 1 };
      checkRegionName(doc, name, i + 1, seen, add);
    } else if (open === null) {
      add(i + 1, `AUTOGEN:${name} の終わりの印に、対応する始まりの印が無い`);
    } else if (open.name !== name) {
      add(i + 1, `AUTOGEN:${name} の終わりの印が、${open.line} 行目の AUTOGEN:${open.name} の始まりの印と合わない`);
      open = null;
    } else {
      open = null;
    }
  }
  if (open !== null) {
    add(open.line, `AUTOGEN:${open.name} の区間が閉じていない (区間の中は、ほかの検査から見えない)`);
  }

  // HTML コメント。AUTOGEN の印は上で見た (1 行で閉じる印だけが、コメントではない)。AUTOGEN 区間の中のコメントも、
  // コードフェンスの外なら落とす (区間は生成器が書く表だけで、コメントの置き場ではない)。複数行のコメントは、
  // 始まりの行を 1 件にする
  let inComment = false;
  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.kinds[i] === 'code-fence' && !inComment) continue;
    const line = doc.lines[i] ?? '';
    let at = 0;
    for (;;) {
      if (inComment) {
        const close = line.indexOf('-->', at);
        if (close === -1) break;
        inComment = false;
        at = close + 3;
        continue;
      }
      const open = line.indexOf('<!--', at);
      if (open === -1) break;
      const close = line.indexOf('-->', open + 4);
      const isMarker = /^<!--\s*AUTOGEN/.test(line.slice(open)) && close !== -1;
      if (!isMarker) {
        add(i + 1, 'HTML コメントを書かない (person/・client/ の文書では、人の目に見えない書き込み口になる)');
      }
      if (close === -1) {
        inComment = true;
        break;
      }
      at = close + 3;
    }
  }

  if (doc.isReadme) {
    const texts: number[] = [];
    for (let i = doc.bodyStart; i < doc.lines.length; i += 1) {
      const line = doc.lines[i] ?? '';
      if (inside[i] === true || doc.kinds[i] === 'html-comment' || line.trim() === '' || HEADING_RE.test(line)) continue;
      texts.push(i + 1);
    }
    if (texts.length > 1) {
      add(texts[1] ?? 1, `README.md の区間 (AUTOGEN) の外には、frontmatter・見出し・1 行の目的だけを書く (文章が ${texts.length} 行ある)`);
    }
  }
  return violations;
}

/** 区間の名前と、置き場所の検査 (始まりの印で 1 回) */
function checkRegionName(
  doc: PersonDoc,
  name: string,
  line: number,
  seen: Set<string>,
  add: (line: number, message: string) => void,
): void {
  if (!AUTOGEN_NAMES.includes(name)) {
    add(line, `管理外の AUTOGEN 区間: ${name} (生成器が管理するのは ${AUTOGEN_NAMES.join('・')} の 3 種だけ)`);
    return;
  }
  const where = regionPlacementProblem(doc, name);
  if (where !== null) add(line, `AUTOGEN:${name} の区間は、この文書には置けない (置けるのは ${where})`);
  if (seen.has(name)) add(line, `AUTOGEN:${name} の区間が 2 つある (生成器が書くのは 1 つ)`);
  seen.add(name);
}

/** 区間を置いてよい場所。違えば、置いてよい場所の説明を返す */
function regionPlacementProblem(doc: PersonDoc, name: string): string | null {
  switch (name) {
    case 'dir-index':
      return doc.isReadme ? null : '各フォルダの README.md だけ';
    case 'adr-index':
      return doc.rel === 'person/decisions/README.md' ? null : 'docs/person/decisions/README.md だけ';
    case 'tentative-index':
      return doc.kind === 'decision-log' ? null : '決定台帳 (kind: decision-log) だけ';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 量 (条件 8)
// ---------------------------------------------------------------------------

/** 本文の字数を数える場所。全体共通 (要件 + design/shared/) は GLOBAL_GROUP、まとまりはその名前。数えない場所は null */
function sizeGroup(rel: string): string | null {
  if (rel.startsWith('person/requirements/')) return GLOBAL_GROUP;
  const context = /^person\/design\/([^/]+)\//.exec(rel)?.[1];
  if (context === undefined) return null;
  return context === SHARED_CONTEXT ? GLOBAL_GROUP : context;
}

/**
 * 本文の字数。frontmatter とコードフェンス (Mermaid を含む) を除く。1 字は 1 文字で、全角も半角も同じ (Unicode の
 * コードポイント単位。改行は数えない)。ADR-0005 の「字数の数え方の細目」。
 */
function countBodyChars(lines: readonly string[], kinds: readonly LineKind[], bodyStart: number): number {
  let total = 0;
  for (let i = bodyStart; i < lines.length; i += 1) {
    if (kinds[i] === 'code-fence') continue;
    total += [...(lines[i] ?? '')].length;
  }
  return total;
}
