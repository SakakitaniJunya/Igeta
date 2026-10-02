// 新しい構成 (docs/person・ai・client) の「文書のつながり」の規則 (docs/design/test/specs/04-doc-graph.md の G1〜G4・G6)。
// 規則の本体は 04 の §0 が正本で、ここは文書の参照と決まりの行を読んで、違反と一覧の行を返す純粋な関数だけを持つ。
// DocGraphCheck が、読んだ文書をここへ渡す。旧い構成の repo では呼ばない。
//
//   G1・G2 向き: person は person だけ、ai は person・ai、client は 3 つとも指してよい (参照の 4 種は core/DocReferences.ts)
//   G3 届く:     ai/specs/** の文書は、depends_on を 1 回以上たどると person/ の文書に届く
//   G4 ADR の引用: accepted・amended の ADR の番号を、person/requirements・person/design の決まりの行が引く
//   G6 仮・未決: person/ の決まりの行で、状態が 仮・未決 のもの (決定台帳の一覧が使う)

import { collectDecisionRows, STATE_ABOLISHED } from './DecisionRows.js';
import { parseFrontmatter, scalar } from './Frontmatter.js';
import type { FrontmatterReference } from './DocReferences.js';
import { resolveRepoPath, scanBodyReferences, scanFrontmatterReferences } from './DocReferences.js';
import type { LineKind } from './LineClassifier.js';
import { classifyLines } from './LineClassifier.js';
import { findTables } from './MarkdownTable.js';
import type { Violation } from './Report.js';
import type { Role } from './Role.js';
import { isGeneratedIndex, ROLES, roleOfPath } from './Role.js';

export interface ConnectionDoc {
  /** targetRoot からの相対パス (区切りは `/`)。違反の file */
  readonly path: string;
  /** docs/ からの相対パス (区切りは `/`) */
  readonly docsRel: string;
  /** frontmatter の id。無ければ undefined */
  readonly id: string | undefined;
  readonly lines: readonly string[];
  readonly kinds: readonly LineKind[];
  /** frontmatter の次の行 (0 始まり)。frontmatter が無ければ 0 */
  readonly bodyStart: number;
  readonly refs: readonly FrontmatterReference[];
}

/** 文書を、つながりの検査が読む形にする。content は文書の全文 */
export function loadConnectionDoc(path: string, docsRel: string, content: string): ConnectionDoc {
  const lines = content.split(/\r?\n/);
  const meta = parseFrontmatter(lines);
  const bodyStart = meta?.bodyStart ?? 0;
  const id = meta === null ? undefined : scalar(meta.data, 'id');
  return {
    path,
    docsRel,
    id: id === undefined || id === '' ? undefined : id,
    lines,
    kinds: classifyLines(lines),
    bodyStart,
    refs: meta === null ? [] : scanFrontmatterReferences(lines, bodyStart),
  };
}

/** 文書の id から、その文書の場所を引く (解決できない id は undefined) */
export type ResolveDoc = (id: string) => { readonly path: string; readonly docsRel: string } | undefined;

// ---------------------------------------------------------------------------
// G1・G2 向き
// ---------------------------------------------------------------------------

/** 役割ごとに、指してはいけない役割。上流 (人の決まり) から下流 (作り方・顧客への提出) へは、逆向きに指さない */
const FORBIDDEN_TARGETS: Readonly<Record<Role, readonly Role[]>> = {
  person: ['ai', 'client'],
  ai: ['client'],
  client: [],
};

/** repo 直下からのパスが、docs/<役割> そのもの、またはその下か。大文字小文字は区別しない (macOS・Windows の既定の FS では同じ場所になる) */
function roleOfRepoPath(repoPath: string): Role | null {
  const lower = repoPath.toLowerCase();
  return ROLES.find((role) => lower === `docs/${role}` || lower.startsWith(`docs/${role}/`)) ?? null;
}

/**
 * 向きの違反 (G1)。参照元の行ごとに 1 件。参照の先が docs/ai・docs/client の配下なら、リンクと参照の形の定義は、
 * ファイルが無くても・フォルダでも当たる (G2 の (b)・(c))。id で指す参照 ((a)・(d)) は、解決できた文書の役割で決める。
 */
export function checkDirections(docs: readonly ConnectionDoc[], resolve: ResolveDoc): readonly Violation[] {
  const violations: Violation[] = [];
  for (const doc of docs) {
    const role = roleOfPath(doc.docsRel);
    if (role === null) continue;
    const forbidden = FORBIDDEN_TARGETS[role];
    if (forbidden.length === 0) continue;
    const report = (line: number, targetRole: Role, how: string): void => {
      violations.push({
        severity: 'violation',
        message: `[direction] ${role} の文書が ${targetRole} の文書を指している (${how})。人の決まりは作り方や提出物を指さない: person は person だけ、ai は person・ai、client は 3 つとも指してよい`,
        file: doc.path,
        line,
      });
    };
    const byId = (id: string): Role | null => {
      const target = resolve(id);
      return target === undefined ? null : roleOfPath(target.docsRel);
    };
    for (const ref of doc.refs) {
      const targetRole = byId(ref.id);
      if (targetRole !== null && forbidden.includes(targetRole)) report(ref.line, targetRole, `${ref.key}: ${ref.id}`);
    }
    for (const ref of scanBodyReferences(doc.lines, doc.kinds, doc.bodyStart)) {
      if (ref.kind === 'qualified-id') {
        const targetRole = byId(ref.docId);
        if (targetRole !== null && forbidden.includes(targetRole)) report(ref.line, targetRole, `修飾 ID: ${ref.docId}/…`);
        continue;
      }
      const resolved = resolveRepoPath(doc.path, ref.destination);
      const targetRole = resolved === null ? null : roleOfRepoPath(resolved);
      if (targetRole !== null && forbidden.includes(targetRole)) {
        report(ref.line, targetRole, `${ref.kind === 'link' ? 'リンク' : '参照の形のリンクの定義'}: ${ref.destination}`);
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// G3 届く
// ---------------------------------------------------------------------------

/** frontmatter の項目 (`depends_on:` など) の行。無ければ 1 */
function frontmatterKeyLine(doc: ConnectionDoc, key: string): number {
  for (let i = 1; i < doc.bodyStart - 1; i += 1) {
    if ((doc.lines[i] ?? '').startsWith(`${key}:`)) return i + 1;
  }
  return 1;
}

/**
 * 届かない文書 (G3)。ai/specs/** の文書 (README.md を除く) の depends_on を 1 回以上たどって、person/ の文書に届かなければ
 * 違反 (文書の depends_on の行)。解決できない id と `external:` はたどらない。たどる途中の文書は、役割を問わない。
 */
export function checkReachability(docs: readonly ConnectionDoc[], resolve: ResolveDoc): readonly Violation[] {
  const byPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  const reachesPerson = (start: ConnectionDoc): boolean => {
    const seen = new Set<string>([start.path]);
    const queue: ConnectionDoc[] = [start];
    for (let doc = queue.shift(); doc !== undefined; doc = queue.shift()) {
      for (const ref of doc.refs) {
        if (ref.key !== 'depends_on' || ref.id.startsWith('external:')) continue;
        const target = resolve(ref.id);
        if (target === undefined) continue;
        if (roleOfPath(target.docsRel) === 'person') return true;
        if (seen.has(target.path)) continue;
        seen.add(target.path);
        const next = byPath.get(target.path);
        if (next !== undefined) queue.push(next);
      }
    }
    return false;
  };
  const violations: Violation[] = [];
  for (const doc of docs) {
    if (!doc.docsRel.startsWith('ai/specs/') || isGeneratedIndex(doc.docsRel) || reachesPerson(doc)) continue;
    violations.push({
      severity: 'violation',
      message: `[reach] ${doc.id ?? doc.path} が person/ の文書に届かない: ai/specs/ の文書は、depends_on をたどると person/ の文書に届く (作り方の上流の、人の決まりを depends_on に書く。解決できない id と external: はたどらない)`,
      file: doc.path,
      line: frontmatterKeyLine(doc, 'depends_on'),
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// 決まりの行 (G4・G6)
// ---------------------------------------------------------------------------
// 決まりの行の読み方 (表・ID の形・決まりの表・決まりの行) は、core/MarkdownTable.ts と core/DecisionRows.ts の 1 か所ずつ
// (テスト仕様 03 の §0)。ここでは読み方を持たず、`collectDecisionRows(findTables(…))` をそのまま使う。列の数が見出しと
// 合わない行も、決まりの行として数える (列のずれは 03 の P3 が違反にする。04 の G4・G6)。

/** 決定台帳の一覧に載せる状態 (人の決めを待つもの)。決まりの行の状態は 決定・仮・未決・廃 */
const PENDING_STATES: readonly string[] = ['仮', '未決'];

/** `ADR-0003` の形 (大文字。直前が英数字でなく、直後が数字でない)。`ADR-0003・0006` の `0006` と、小文字の `adr-0003` は引かない */
const ADR_CITATION_RE = /(?<![A-Za-z0-9])ADR-(\d{4})(?!\d)/g;

/** 引かれていなければならない ADR の status。proposed・superseded などは、決定として反映する前なので求めない */
const CITED_ADR_STATUSES: ReadonlySet<string> = new Set(['accepted', 'amended']);

export interface AdrDoc {
  /** `adr-NNNN-…` の id */
  readonly id: string;
  readonly status: string | undefined;
  /** targetRoot からの相対パス */
  readonly path: string;
}

/**
 * 引かれていない ADR (G4)。status が accepted・amended の ADR の番号を、person/requirements/**・person/design/** の
 * 決まりの行 (状態が 廃 の行を除く) のどれかが `ADR-NNNN` の形で持つこと。無ければ ADR の 1 行目の違反。
 * 保証するのは番号が引かれていることだけで、行の中身が ADR の決定と合っているかは、人が承認のときに見る。
 */
export function checkAdrCitations(docs: readonly ConnectionDoc[], adrs: readonly AdrDoc[]): readonly Violation[] {
  const cited = new Set<string>();
  for (const doc of docs) {
    const isDecisionArea = doc.docsRel.startsWith('person/requirements/') || doc.docsRel.startsWith('person/design/');
    if (!isDecisionArea || isGeneratedIndex(doc.docsRel)) continue;
    for (const row of collectDecisionRows(findTables(doc.lines, doc.kinds, doc.bodyStart))) {
      if (row.state === STATE_ABOLISHED) continue;
      for (const matched of row.cells.join(' ').matchAll(ADR_CITATION_RE)) cited.add(matched[1] ?? '');
    }
  }
  const violations: Violation[] = [];
  for (const adr of adrs) {
    const number = /^adr-(\d{4})/.exec(adr.id)?.[1];
    if (number === undefined || adr.status === undefined || !CITED_ADR_STATUSES.has(adr.status) || cited.has(number)) continue;
    violations.push({
      severity: 'violation',
      message: `[adr] ${adr.id} は status: ${adr.status} だが、person/requirements/ か person/design/ の決まりの行が ADR-${number} の形で引いていない (決定を、要件か設計の行へ反映し、その行から引く。廃の行は数えない)`,
      file: adr.path,
      line: 1,
    });
  }
  return violations;
}

export interface PendingRow {
  /** docs/ からの相対パス */
  readonly docsRel: string;
  /** targetRoot からの相対パス */
  readonly path: string;
  /** 1 始まりの行番号 */
  readonly line: number;
  /** 文書の id と行の ID を `/` でつないだ修飾 ID。文書に id が無ければ、ファイル名 (拡張子なし) */
  readonly qualifiedId: string;
  readonly state: string;
  /** 決まり (行の 2 番目のセル) */
  readonly text: string;
}

/**
 * 仮・未決の行 (G6)。person/ の決まりの行 (README.md を除く) で、状態が 仮・未決 のもの。ai/・client/ からは集めない。
 * 並びは、docs/ からのパスの文字コード順、同じ文書の中は行の順。
 */
export function collectPendingRows(docs: readonly ConnectionDoc[]): readonly PendingRow[] {
  const rows: PendingRow[] = [];
  for (const doc of docs) {
    if (roleOfPath(doc.docsRel) !== 'person' || isGeneratedIndex(doc.docsRel)) continue;
    const docId = doc.id ?? (doc.docsRel.split('/').pop() ?? doc.docsRel).replace(/\.md$/, '');
    for (const row of collectDecisionRows(findTables(doc.lines, doc.kinds, doc.bodyStart))) {
      if (!PENDING_STATES.includes(row.state)) continue;
      rows.push({ docsRel: doc.docsRel, path: doc.path, line: row.line, qualifiedId: `${docId}/${row.id}`, state: row.state, text: row.cells[1] ?? '' });
    }
  }
  return rows.sort((a, b) => (a.docsRel < b.docsRel ? -1 : a.docsRel > b.docsRel ? 1 : a.line - b.line));
}
