// 人の文書 (docs/person/・docs/client/) の、型・量・人の目に見えない書き込み口の検査。
// Spec: docs/design/test/specs/03-person-form.md の規則 P1〜P10 (ADR-0002 条件 5〜10)。`template-check` の中で動く
// (DocTemplateCheck が雛形の ID の接頭辞を渡す)。「決まりの表・決まりの行・ID の形」の定義は core/DecisionRows.ts。
//
// P1 新しい構成 (docs/person・ai・client のどれかがある) の repo だけで動く。旧い構成の repo では何も出さない
// P2 文書の kind は frontmatter の kind。無ければ置き場所の型から決める。両者が別の kind を指す文書と、kind を決められない
//    文書は、型の検査 (P3〜P6) をしない (置き場所の検査が違反にする)
// P3 決まりの表のデータの行は全部が決まりの行 (最初のセルが ID の形だけ)。列の数は見出しと同じで、最後のセルは
//    決定・仮・未決・廃。person/ のどの kind の文書にも当てる
// P4 ○ の kind (core/Role.ts の formCheck): 自分の接頭辞の決まりの行が 1 つ以上ある。その接頭辞の ID を最初のセルに持つ
//    行が、決まりの表でない表にあれば違反
// P5 図が要る kind: ```mermaid のコードフェンスが 1 つ以上ある
// P6 ○ の kind は 100 行 (requirements は 150 行)。行数の違反は、この検査が 1 件だけ出す (DocTemplateCheck は、新しい構成の
//    ○ の kind の人の文書に、雛形の line_limit による検査を当てない)
// P7 まとまり (person/design/<c>/) の本文の合計 15,000 字、全体共通 (要件 + design/shared/) の合計 30,000 字を超えたら警告。
//    Igeta の版が SIZE_LIMIT_VIOLATION_FROM_MAJOR 以上なら違反 (検査の強さは構成の実在と Igeta の版だけで決まり、利用 repo の
//    設定では変えられない。ADR-0005。RoleBoundaryCheck の旧い構成の切替と同じ作り)。版を読めなければ検査不能
// P8 廃の行: (a) 同じ文書の中で、廃の ID を別の行に使えば違反。(b) base (宛先のブランチ) があれば、宛先と HEAD の枝分かれの点
//    を起点に、起点の person/ の文書で 廃 だった行が、いまも同じ文書 (frontmatter の id で照らす) に 廃 のままなければ違反。
//    起点を読めない・起点の文書に frontmatter の id が無いときは検査不能
// P9 書き込み口 (README.md を含む person/・client/ の全部の文書): HTML コメントは違反 (コードフェンスの中の例は除く。
//    インラインコードの中も違反)。生成区間の印は、生成器が書く文字列と行の全体が一致するものだけが例外。生成区間は
//    dir-index・adr-index・tentative-index の 3 種だけで、決まった文書に 1 つずつ、閉じていて、入れ子にしない。
//    README.md は区間の外に frontmatter・見出し・目的の 1 行だけ

import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { SHARED_CONTEXT } from '../core/Context.js';
import type { DecisionRow } from '../core/DecisionRows.js';
import { collectDecisionRows, DECISION_STATES, idOf, isDecisionTable, STATE_ABOLISHED, STATE_COLUMN } from '../core/DecisionRows.js';
import { isDirectory, listDocFiles } from '../core/DocFiles.js';
import type { Frontmatter } from '../core/Frontmatter.js';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import { GitError, listFilesAtRef, mergeBase, readFileAtRef } from '../core/GitRef.js';
import type { LineKind } from '../core/LineClassifier.js';
import { classifyLines } from '../core/LineClassifier.js';
import type { MarkdownTable } from '../core/MarkdownTable.js';
import { findTables } from '../core/MarkdownTable.js';
import type { Violation } from '../core/Report.js';
import { detectLayout, isGeneratedIndex, kindOfPath, placementOf, roleOfPath } from '../core/Role.js';
import type { SemVer } from '../core/Version.js';
import { readIgetaVersion } from '../core/Version.js';

/** ○ の kind の 1 本の行数 (P6)。requirements だけ 150 行 */
export const PERSON_LINE_LIMIT = 100;
export const REQUIREMENTS_LINE_LIMIT = 150;

/** まとまり 1 つの本文の合計字数と、全体共通 (要件 + design/shared/) の本文の合計字数 (P7) */
export const CONTEXT_CHAR_LIMIT = 15_000;
export const SHARED_CHAR_LIMIT = 30_000;

/** 合計字数の上限を、警告から違反に上げる Igeta のメジャー版 (P7・ADR-0005 決定 1) */
export const SIZE_LIMIT_VIOLATION_FROM_MAJOR = 1;

/** 生成器が管理する AUTOGEN 区間の名前 (P9) */
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
  /** 宛先のブランチ (変更を入れる先)。HEAD との枝分かれの点を、廃の行を比べる起点にする。無ければ同じ文書の中だけを見る */
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

type Add = (line: number, message: string) => void;

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

  /** 型の検査 (person/ の文書。kind を決められたもの)。P3〜P6 */
  #checkForm(doc: PersonDoc, reportedKinds: Set<string>): readonly Violation[] {
    const kind = doc.kind ?? '';
    const violations: Violation[] = [];
    const add: Add = (line, message) => {
      violations.push({ severity: 'violation', message, file: doc.file, line });
    };
    const tables = findTables(doc.lines, doc.kinds, doc.bodyStart);
    checkDecisionRows(tables, add);

    const placement = placementOf(kind);
    if (placement === undefined || placement.role !== 'person') return violations;
    if (placement.formCheck === 'full') {
      const template = this.#options.templates.get(kind);
      // 雛形が無い kind は、DocTemplateCheck が未登録の kind として違反にする。ここでは重ねない
      if (template !== undefined) {
        if (template.idPrefixes.length > 0) {
          checkOwnRows(tables, template.idPrefixes, add);
        } else if (!reportedKinds.has(kind)) {
          reportedKinds.add(kind);
          violations.push({
            severity: 'cannot-check',
            message: `kind: ${kind} の雛形に id_prefix が無く、決まりの行を見分けられない (決まりの表の検査ができない。雛形に ID の接頭辞を足す)`,
          });
        }
      }
      const limit = kind === 'requirements' ? REQUIREMENTS_LINE_LIMIT : PERSON_LINE_LIMIT;
      const total = countLines(doc.lines);
      if (total > limit) {
        add(1, `人の文書の行数上限 (${limit}) を超えている: ${total} 行 (作り方の詳細は ai/ の文書へ移し、人が決める行だけを残す)`);
      }
    }
    if (placement.needsDiagram && countMermaidDiagrams(doc.lines, doc.bodyStart) === 0) {
      add(1, `図が 1 枚も無い (kind: ${kind} は Mermaid の図 (\`\`\`mermaid) が 1 枚以上要る)`);
    }
    return violations;
  }

  /** まとまりごと・全体共通の本文の合計字数 (P7)。上限を超えたら警告。Igeta の版が切替の版以上なら違反 */
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

  /** 廃の行 (P8)。同じ文書の中と、宛先のブランチ (base) があれば、枝分かれの点との比較 */
  #checkAbolished(ctx: CheckContext, docsDir: string, docs: readonly PersonDoc[]): readonly Violation[] {
    const violations: Violation[] = [];
    // 同じ行を、同じ文書の中の検査と起点との比較が二重に指さない
    const reported = new Set<string>();
    const add = (key: string, file: string, line: number, message: string): void => {
      if (reported.has(key)) return;
      reported.add(key);
      violations.push({ severity: 'violation', message, file, line });
    };

    const headRows = new Map<string, Array<{ readonly doc: PersonDoc; readonly row: DecisionRow }>>();
    for (const doc of docs) {
      if (doc.role !== 'person' || doc.isReadme) continue;
      const rows = decisionRowsOf(doc.lines, doc.kinds, doc.bodyStart);
      const byId = new Map<string, DecisionRow[]>();
      for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row]);
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
    // 起点の文書に frontmatter の id が無いと、廃の行を id で照らせない。黙って通さず、検査不能にする
    const unreadable: Violation[] = [];
    try {
      const start = mergeBase(root, base, 'HEAD');
      const where = `${base} との枝分かれの点 (${start.slice(0, 7)})`;
      const prefix = docsRel === '' ? '' : `${docsRel}/`;
      for (const path of listFilesAtRef(root, start, `${prefix}person`)) {
        const rel = path.slice(prefix.length);
        if (!path.endsWith('.md') || isGeneratedIndex(rel)) continue;
        const lines = readFileAtRef(root, start, path).split(/\r?\n/);
        const meta = parseFrontmatter(lines);
        const docId = meta === null ? undefined : nonEmpty(scalar(meta.data, 'id'));
        if (meta === null || docId === undefined) {
          unreadable.push({
            severity: 'cannot-check',
            message: `${where} の文書に frontmatter の id が無く、廃の行を照らせない (--base を付けた検査は、起点の文書を frontmatter の id で照らす)`,
            file: path,
          });
          continue;
        }
        for (const old of decisionRowsOf(lines, classifyLines(lines), meta.bodyStart)) {
          if (old.state !== STATE_ABOLISHED) continue;
          const now = (headRows.get(docId) ?? []).filter(({ row }) => row.id === old.id);
          const label = `${docId}/${old.id}`;
          if (now.length === 0) {
            add(
              `base:${path}:${old.line}`,
              path,
              old.line,
              `廃の行を消している: ${label} は ${where} で 廃 だったが、いまは行が無い (廃の行は消さず、状態を戻さず、番号を使い直さない)`,
            );
            continue;
          }
          for (const { doc, row } of now) {
            if (row.state === STATE_ABOLISHED) continue;
            add(
              `head:${doc.file}:${row.line}`,
              doc.file,
              row.line,
              `廃の行を戻している: ${label} は ${where} で 廃 だったが、いまは「${row.state}」 (状態を戻さず、番号を使い直さない)`,
            );
          }
        }
      }
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      return [...violations, { severity: 'cannot-check', message: `--base ${base} と比べられない: ${error.message}` }];
    }
    return [...violations, ...unreadable];
  }
}

const nonEmpty = (value: string | undefined): string | undefined => (value === undefined || value === '' ? undefined : value);

/** P2: 置き場所の型と frontmatter の kind から、kind を決める。食い違い・決められないときは null (他の検査が違反にする) */
function resolveKind(rel: string, meta: Frontmatter | null): string | null {
  const declared = meta === null ? undefined : nonEmpty(scalar(meta.data, 'kind'));
  const byPath = kindOfPath(rel);
  if (declared === undefined) return byPath;
  return byPath !== null && byPath !== declared ? null : declared;
}

/** 決まりの行のうち、列の数が見出しと同じ行 (最後のセルが状態の列と分かる行) */
const decisionRowsOf = (lines: readonly string[], kinds: readonly LineKind[], bodyStart: number): readonly DecisionRow[] =>
  collectDecisionRows(findTables(lines, kinds, bodyStart)).filter((row) => row.aligned);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const thousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------------------------------------------------------------------------
// 型 (P3〜P6)
// ---------------------------------------------------------------------------

/** P3: 決まりの表のデータの行は、全部が決まりの行。最初のセルが ID の形だけ・列の数が見出しと同じ・最後のセルが状態の値 */
function checkDecisionRows(tables: readonly MarkdownTable[], add: Add): void {
  for (const table of tables) {
    if (!isDecisionTable(table)) continue;
    for (const row of table.rows) {
      const first = row.cells[0] ?? '';
      const id = idOf(first);
      if (id === null) {
        add(row.line, `決まりの表の行の最初のセルが ID の形ではない: 「${first}」 (英大文字で始まる接頭辞 + - + 数字 3 桁だけ。例: BF-113)`);
      } else if (row.cells.length !== table.headers.length) {
        add(row.line, `${id} の行の列数 (${row.cells.length}) が見出しの列数 (${table.headers.length}) と違う (最後の列が「${STATE_COLUMN}」になっていない)`);
      } else if (!DECISION_STATES.includes(row.cells[row.cells.length - 1] ?? '')) {
        add(row.line, `${id} の状態が不正: 「${row.cells[row.cells.length - 1] ?? ''}」 (${DECISION_STATES.join('・')}のどれか)`);
      }
    }
  }
}

/**
 * P4: ○ の kind は、自分の接頭辞の決まりの行が 1 つ以上ある。その接頭辞の ID を最初のセルに持つ行が、決まりの表でない
 * 表にあれば違反 (見出しの行)。そういう表があるときは、決まりの行が無いことを重ねて報告しない。
 */
function checkOwnRows(tables: readonly MarkdownTable[], prefixes: readonly string[], add: Add): void {
  const own = new RegExp(`^(?:${prefixes.map(escapeRegExp).join('|')})-\\d{3}$`);
  const labels = prefixes.map((prefix) => `${prefix}-nnn`).join('・');
  let ownRows = 0;
  let strayTables = 0;
  for (const table of tables) {
    const count = table.rows.filter((row) => own.test(row.cells[0] ?? '')).length;
    if (count === 0) continue;
    if (isDecisionTable(table)) {
      ownRows += count;
    } else {
      strayTables += 1;
      add(
        table.headerLine,
        `${labels} の行が、決まりの表ではない表にある (最後の列を「${STATE_COLUMN}」にする。見出し: ${table.headers.join(' | ')})`,
      );
    }
  }
  if (ownRows === 0 && strayTables === 0) {
    add(1, `決まりの行が 1 つも無い (最後の列が「${STATE_COLUMN}」の表に、最初のセルが ${labels} の行が 1 つ以上要る)`);
  }
}

/** 行数 (P6)。frontmatter も数える。末尾の改行 1 つは数えない */
function countLines(lines: readonly string[]): number {
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/**
 * Mermaid の図 (```mermaid のコードフェンス) の数。ほかのコードフェンスの中にある例と、画像のリンクは数えない。
 * フェンスの前の字下げは、空白 3 つまで (タブで字下げした行は、描画ではコードブロックで、フェンスではない)
 */
function countMermaidDiagrams(lines: readonly string[], bodyStart: number): number {
  let count = 0;
  let open: { readonly marker: string; readonly length: number } | null = null;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const fence = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i] ?? '');
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
// 書き込み口 (P9)
// ---------------------------------------------------------------------------

const AUTOGEN_MARKER_RE = /^<!--\s*AUTOGEN:([A-Za-z0-9_-]+):(start|end)(?![A-Za-z0-9_-])/;
const HEADING_RE = /^\s{0,3}#{1,6}(\s|$)/;

/**
 * 生成器 (checks/DocGraphCheck.ts の ADR_INDEX_START など) が書く、生成区間の印の文字列。行の全体がこれと一致する印
 * だけが、HTML コメントの例外 (印の後ろに文を足したもの・読めない印・1 行で閉じない印は違反)。
 */
const markerStart = (name: string): string => `<!-- AUTOGEN:${name}:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->`;
const markerEnd = (name: string): string => `<!-- AUTOGEN:${name}:end -->`;
const GENERATED_MARKERS: ReadonlySet<string> = new Set(AUTOGEN_NAMES.flatMap((name) => [markerStart(name), markerEnd(name)]));

interface Region {
  readonly name: string;
  readonly line: number;
}

/** 区間の始まりと終わりの印を 1 つ読み、開いている区間 (無ければ null) を更新して返す */
function trackRegion(doc: PersonDoc, open: Region | null, seen: Set<string>, name: string, edge: string, line: number, add: Add): Region | null {
  if (edge === 'start') {
    if (open !== null) {
      add(line, `AUTOGEN 区間が入れ子になっている (${open.line} 行目の ${open.name} が閉じていない)`);
      return open;
    }
    checkRegionName(doc, name, line, seen, add);
    return { name, line };
  }
  if (open === null) {
    add(line, `AUTOGEN:${name} の終わりの印に、対応する始まりの印が無い`);
  } else if (open.name !== name) {
    add(line, `AUTOGEN:${name} の終わりの印が、${open.line} 行目の AUTOGEN:${open.name} の始まりの印と合わない`);
  }
  return null;
}

/**
 * person/・client/ の文書の、HTML コメント・AUTOGEN 区間・README.md の区間の外の文章。
 * HTML コメントは、コードフェンスの外のものを全部違反にする (AUTOGEN 区間の中も、インラインコードの中の `<!--` も)。
 * 複数行のコメントは、始まりの行を 1 件にする。例外は、生成器が書く印と行の全体が一致する行だけ。
 */
function checkWritePaths(doc: PersonDoc): readonly Violation[] {
  const violations: Violation[] = [];
  const add: Add = (line, message) => {
    violations.push({ severity: 'violation', message, file: doc.file, line });
  };
  const inside = new Array<boolean>(doc.lines.length).fill(false);
  let open: Region | null = null;
  const seen = new Set<string>();
  let inComment = false;

  for (let i = 0; i < doc.lines.length; i += 1) {
    const line = doc.lines[i] ?? '';
    if (doc.kinds[i] === 'code-fence' && !inComment) {
      inside[i] = open !== null;
      continue;
    }
    inside[i] = open !== null;
    let at = 0;
    for (;;) {
      if (inComment) {
        const close = line.indexOf('-->', at);
        if (close === -1) break;
        inComment = false;
        at = close + 3;
        continue;
      }
      const start = line.indexOf('<!--', at);
      if (start === -1) break;
      const text = line.slice(start);
      if (/^<!--\s*AUTOGEN/.test(text)) {
        inside[i] = true;
        const parsed = AUTOGEN_MARKER_RE.exec(text);
        const name = parsed?.[1];
        const edge = parsed?.[2];
        if (name === undefined || edge === undefined) {
          add(i + 1, 'AUTOGEN の印が読めない (生成器が書く形は <!-- AUTOGEN:<名前>:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand --> と <!-- AUTOGEN:<名前>:end -->)');
        } else {
          // 管理外の名前は、区間の名前の検査 (trackRegion) が違反にする
          if (AUTOGEN_NAMES.includes(name) && !GENERATED_MARKERS.has(line)) {
            add(i + 1, 'AUTOGEN の印が、生成器が書く文字列と一致しない (行の全体が、生成器の書く始まりの印か終わりの印と同じものだけを置ける。印の後ろに文を足さない)');
          }
          open = trackRegion(doc, open, seen, name, edge, i + 1, add);
        }
      } else {
        add(i + 1, 'HTML コメントを書かない (person/・client/ の文書では、人の目に見えない書き込み口になる)');
      }
      const close = line.indexOf('-->', start + 4);
      if (close === -1) {
        inComment = true;
        break;
      }
      at = close + 3;
    }
  }
  if (open !== null) {
    add(open.line, `AUTOGEN:${open.name} の区間が閉じていない (区間の中は、ほかの検査から見えない)`);
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
function checkRegionName(doc: PersonDoc, name: string, line: number, seen: Set<string>, add: Add): void {
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
// 量 (P7)
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
