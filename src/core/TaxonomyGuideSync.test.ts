// node --test dist/core/TaxonomyGuideSync.test.js
// 置き場所の正本 (要件定義書 02 §7 の表) と、コード側の表 (Role.ts の ROLE_OF_KIND) の突き合わせ
// (ADR-0005 決定 2、ADR-0009)。表を直したのにコードを直し忘れた (逆も) と、ここで落ちる。
//
// 突き合わせる項目: kind の集合 / 確定させる人 / 型の検査の区分 / 図が要る kind / 置き場所のフォルダ /
// 「15 本の対象外」/ 1 フォルダの上限 / 区分ごとの kind の数。
// 文書体系ガイド (templates/docs/guides/01-document-taxonomy.md) は、新しい表をまだ持たないので対象に含めない。
//
// 表の読み方は diffAgainstRoleTable に閉じ、表を書き換えた文書 (kind の削除・確定させる人の入れ替え・フォルダの
// 取り違えなど) を渡して「食い違いを見つけること」も確かめる。1 行に kind が複数 (`a / b (図) / c`) 書かれた行は、
// 型の検査の区分とフォルダも、同じ順に並んだものとして読む。
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ARC42_BY_KIND } from '../checks/DocTemplateCheck.js';
import { MAX_DOCS_PER_FOLDER } from '../checks/FolderSizeCheck.js';
import { listDocFiles } from './DocFiles.js';
import { parseFrontmatter, scalar } from './Frontmatter.js';
import { IGETA_ROOT } from './Paths.js';
import { FOLDER_SIZE_EXEMPT_DIRS, ROLE_OF_KIND, ROLES } from './Role.js';
import type { FormCheck } from './Role.js';

/** 置き場所の正本の文書の id。場所ではなく id で探す (Igeta 自身の docs/ を移しても、このテストは動く。REQ-302) */
const REQUIREMENTS_ID = 'audience-directories';

/** 表のパスの記法のうち、コード側と書き方が違うもの */
const TABLE_TOKENS: ReadonlyArray<readonly [string, string]> = [['<提出物名>', '<deliverable>']];

/** 15 本を超えたら、まとまりの下位フォルダへ全部移す kind (§7 の「決まり」の最終行)。表の置き場所の欄には、移した先が書かれない */
const SPLITTABLE_KINDS: ReadonlySet<string> = new Set(['tasks', 'guide', 'explanation', 'runbook', 'implementation-order']);

const FORM_OF_MARK: ReadonlyMap<string, FormCheck> = new Map([
  ['○', 'full'],
  ['図', 'diagram'],
  ['—', 'none'],
]);

interface KindEntry {
  readonly kind: string;
  /** kind の後ろに `(図)` が付いている */
  readonly diagramMark: boolean;
}

interface KindRow {
  readonly role: string;
  readonly kinds: readonly KindEntry[];
  readonly placeCell: string;
  readonly formCell: string;
}

interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const splitCells = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

/** 「## 7.」の節の行 (見出しの次から、次の `## ` の手前まで)。節が無ければ null */
function section7Lines(markdown: string): readonly string[] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+7\.\s/.test(line));
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, next === -1 ? undefined : next);
}

/** 節の中の表。見出し行と区切り行を分けて返す */
function tablesOf(lines: readonly string[]): readonly Table[] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      current = null;
      continue;
    }
    if (current === null) {
      current = [];
      blocks.push(current);
    }
    current.push(line);
  }
  return blocks.map((block) => ({
    header: splitCells(block[0] ?? ''),
    rows: block.slice(2).map(splitCells),
  }));
}

function parseKindCell(cell: string): KindEntry[] | null {
  const entries: KindEntry[] = [];
  for (const part of cell.split('/')) {
    const matched = /^([a-z][a-z0-9-]*)(\s*\(図\))?$/.exec(part.trim());
    if (matched === null) return null;
    entries.push({ kind: matched[1] ?? '', diagramMark: matched[2] !== undefined });
  }
  return entries;
}

function expandBraces(text: string): string[] {
  const matched = /\{([^{}]*)\}/.exec(text);
  if (matched === null) return [text];
  return (matched[1] ?? '').split(',').flatMap((alternative) => expandBraces(text.replace(matched[0], alternative)));
}

const applyTokens = (path: string): string =>
  TABLE_TOKENS.reduce((replaced, [table, code]) => replaced.replace(table, code), path);

/** 置き場所の欄のパス (コードスパン) を、フォルダへ。波括弧を展開し、末尾が `/` のものはそのフォルダ、他はファイルの親。
 *  person・ai・client で始まらないもの (「how-to/02-implementation-order.md」のような相対の補足) は読まない */
function tableDirs(placeCell: string): string[] {
  const dirs: string[] = [];
  for (const span of placeCell.matchAll(/`([^`]+)`/g)) {
    const text = span[1] ?? '';
    if (!ROLES.some((role) => text.startsWith(`${role}/`))) continue;
    for (const expanded of expandBraces(text)) {
      const path = applyTokens(expanded);
      dirs.push(path.endsWith('/') ? path.slice(0, -1) : posix.dirname(path));
    }
  }
  return dirs;
}

/** コード側の kind のパターンのフォルダ。分けた先 (`<フォルダ>/<c>`) は、表の欄に書かれないので、表のフォルダと照合する前に除く */
function codeDirs(kind: string, rowDirs: ReadonlySet<string>): Set<string> {
  const dirs = new Set<string>();
  for (const pattern of ROLE_OF_KIND.get(kind)?.patterns ?? []) {
    const dir = posix.dirname(pattern);
    const isSplitTarget = SPLITTABLE_KINDS.has(kind) && dir.endsWith('/<c>') && rowDirs.has(dir.slice(0, -'/<c>'.length));
    if (!isSplitTarget) dirs.add(dir);
  }
  return dirs;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((item) => b.has(item));
const show = (items: Iterable<string>): string => `{${[...items].sort().join(', ')}}`;

/** 要件定義書 02 §7 と ROLE_OF_KIND の食い違いを、メッセージの一覧で返す。食い違いが無ければ空 */
function diffAgainstRoleTable(markdown: string): string[] {
  const diffs: string[] = [];
  const lines = section7Lines(markdown);
  if (lines === null) return ['「## 7.」の節が無い'];
  const tables = tablesOf(lines);
  const kindTable = tables.find((table) => table.header[1] === 'kind');
  const ruleTable = tables.find((table) => table.header[0] === '決まり');
  if (kindTable === undefined) return ['kind の置き場所の表が無い'];

  const rows: KindRow[] = [];
  for (const cells of kindTable.rows) {
    const kinds = parseKindCell(cells[1] ?? '');
    if (cells.length !== 4 || kinds === null) {
      diffs.push(`表の行が読めない: ${cells.join(' | ')}`);
      continue;
    }
    rows.push({ role: cells[0] ?? '', kinds, placeCell: cells[2] ?? '', formCell: cells[3] ?? '' });
  }

  // kind の集合 (ARC42_BY_KIND との一致は Role.test.ts が見る。ここは表との一致)
  const tableKinds = rows.flatMap((row) => row.kinds.map((entry) => entry.kind));
  for (const kind of tableKinds.filter((kind, index) => tableKinds.indexOf(kind) !== index)) diffs.push(`表の kind が重複している: ${kind}`);
  for (const kind of tableKinds) if (!ROLE_OF_KIND.has(kind)) diffs.push(`表にあって ROLE_OF_KIND に無い kind: ${kind}`);
  for (const kind of ROLE_OF_KIND.keys()) if (!tableKinds.includes(kind)) diffs.push(`ROLE_OF_KIND にあって表に無い kind: ${kind}`);

  for (const row of rows) {
    const label = row.kinds.map((entry) => entry.kind).join(' / ');

    // 確定させる人
    for (const { kind } of row.kinds) {
      const placement = ROLE_OF_KIND.get(kind);
      if (placement !== undefined && placement.role !== row.role) diffs.push(`${kind}: 確定させる人が違う (表 ${row.role} / コード ${placement.role})`);
    }

    // 型の検査の区分。値が 1 つなら行の全部の kind、kind と同じ数なら同じ順に対応する
    const marks = row.formCell.split('/').map((mark) => mark.trim());
    const forms = marks.map((mark) => FORM_OF_MARK.get(mark));
    if (forms.some((form) => form === undefined) || (marks.length !== 1 && marks.length !== row.kinds.length)) {
      diffs.push(`${label}: 型の検査の欄が読めない: ${row.formCell}`);
    } else {
      row.kinds.forEach(({ kind }, index) => {
        const expected = forms.length === 1 ? forms[0] : forms[index];
        const actual = ROLE_OF_KIND.get(kind)?.formCheck;
        if (actual !== undefined && actual !== expected) diffs.push(`${kind}: 型の検査の区分が違う (表 ${String(expected)} / コード ${actual})`);
      });
    }

    // 図が要る kind: 表の (図) と、型の検査が 図 の kind
    row.kinds.forEach(({ kind, diagramMark }, index) => {
      const form = forms.length === 1 ? forms[0] : forms[index];
      const expected = diagramMark || form === 'diagram';
      const actual = ROLE_OF_KIND.get(kind)?.needsDiagram;
      if (actual !== undefined && actual !== expected) diffs.push(`${kind}: 図が要るかが違う (表 ${String(expected)} / コード ${String(actual)})`);
    });

    // 置き場所のフォルダ。行ぜんぶの集合が一致すること。kind とフォルダが同じ数なら、同じ順に対応すること
    const dirs = tableDirs(row.placeCell);
    const rowDirs = new Set(dirs);
    const codeUnion = new Set(row.kinds.flatMap(({ kind }) => [...codeDirs(kind, rowDirs)]));
    if (!sameSet(rowDirs, codeUnion)) diffs.push(`${label}: 置き場所のフォルダが違う (表 ${show(rowDirs)} / コード ${show(codeUnion)})`);
    if (dirs.length === row.kinds.length) {
      row.kinds.forEach(({ kind }, index) => {
        const expected = new Set([dirs[index] ?? '']);
        const actual = codeDirs(kind, rowDirs);
        if (!sameSet(expected, actual)) diffs.push(`${kind}: 置き場所のフォルダが違う (表 ${show(expected)} / コード ${show(actual)})`);
      });
    }
  }

  // 区分ごとの kind の数 (「計 47 kind (person 18・ai 27・client 2)」)
  const counts = /計\s*(\d+)\s*kind\s*\(person\s*(\d+)・ai\s*(\d+)・client\s*(\d+)\)/.exec(lines.join('\n'));
  if (counts === null) {
    diffs.push('「計 N kind (person N・ai N・client N)」の行が無い');
  } else {
    const actual = [ROLE_OF_KIND.size, ...ROLES.map((role) => [...ROLE_OF_KIND.values()].filter((placement) => placement.role === role).length)];
    const written = counts.slice(1, 5).map(Number);
    if (written.join() !== actual.join()) diffs.push(`kind の数が違う (表の文 ${written.join('・')} / コード ${actual.join('・')})`);
  }

  // 15 本の対象外と、1 フォルダの上限
  const exemptRow = ruleTable?.rows.find((cells) => /^\d+ 本の対象外$/.test(cells[0] ?? ''));
  if (exemptRow === undefined) {
    diffs.push('「15 本の対象外」の行が無い');
  } else {
    const limit = Number(/^(\d+) 本の対象外$/.exec(exemptRow[0] ?? '')?.[1]);
    if (limit !== MAX_DOCS_PER_FOLDER) diffs.push(`1 フォルダの上限が違う (表 ${limit} / コード ${MAX_DOCS_PER_FOLDER})`);
    const exemptDirs = new Set(tableDirs(exemptRow[1] ?? ''));
    if (!sameSet(exemptDirs, new Set(FOLDER_SIZE_EXEMPT_DIRS))) {
      diffs.push(`15 本の対象外のフォルダが違う (表 ${show(exemptDirs)} / コード ${show(FOLDER_SIZE_EXEMPT_DIRS)})`);
    }
  }
  return diffs;
}

function readRequirements(): string {
  const docsDir = join(IGETA_ROOT, 'docs');
  const found = listDocFiles(docsDir).filter((rel) => {
    const meta = parseFrontmatter(readFileSync(join(docsDir, rel), 'utf8').split(/\r?\n/));
    return meta !== null && scalar(meta.data, 'id') === REQUIREMENTS_ID;
  });
  assert.equal(found.length, 1, `docs/ に id: ${REQUIREMENTS_ID} の文書が 1 本だけあること (見つかった: ${found.join(', ') || 'なし'})`);
  return readFileSync(join(docsDir, found[0] ?? ''), 'utf8');
}

const requirements = readRequirements();

/** 要件定義書の §7 の中の文字列を 1 か所だけ書き換える。書き換え元が無ければテストの前提が崩れているので落とす */
function mutate(from: string, to: string): string {
  const section = requirements.search(/^##\s+7\.\s/m);
  const at = section === -1 ? -1 : requirements.indexOf(from, section);
  assert.notEqual(at, -1, `要件定義書 02 の §7 に見つからない: ${from}`);
  return `${requirements.slice(0, at)}${to}${requirements.slice(at + from.length)}`;
}

describe('TaxonomyGuideSync: 要件定義書 02 §7 と ROLE_OF_KIND', () => {
  it('kind の集合・確定させる人・型の検査の区分・図・置き場所・15 本の対象外・kind の数が、全部一致する', () => {
    assert.deepEqual(diffAgainstRoleTable(requirements), []);
  });

  it('表の kind の集合は ARC42_BY_KIND と一致する (REQ-102)', () => {
    const lines = section7Lines(requirements) ?? [];
    const kindTable = tablesOf(lines).find((table) => table.header[1] === 'kind');
    const tableKinds = (kindTable?.rows ?? []).flatMap((cells) => parseKindCell(cells[1] ?? '')?.map((entry) => entry.kind) ?? []);
    assert.deepEqual([...tableKinds].sort(), [...ARC42_BY_KIND.keys()].sort());
    assert.deepEqual([...ROLE_OF_KIND.keys()].sort(), [...ARC42_BY_KIND.keys()].sort());
  });

  it('1 行に kind が複数ある行 (`a / b (図) / c`) と、型の検査の欄の並び (`○ / ○ / —`) を、同じ順に読める', () => {
    const lines = section7Lines(requirements) ?? [];
    const rows = (tablesOf(lines).find((table) => table.header[1] === 'kind')?.rows ?? []).filter((cells) =>
      (cells[1] ?? '').startsWith('business-flow'),
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(parseKindCell(rows[0]?.[1] ?? ''), [
      { kind: 'business-flow', diagramMark: true },
      { kind: 'screen-spec', diagramMark: true },
      { kind: 'feature-brief', diagramMark: false },
    ]);
    assert.equal(rows[0]?.[3], '○ / ○ / —');
    assert.deepEqual(tableDirs(rows[0]?.[2] ?? ''), [
      'person/design/<c>/flows',
      'person/design/<c>/screens',
      'person/design/<c>/features',
    ]);
  });
});

describe('TaxonomyGuideSync: 表を書き換えると、食い違いを見つける', () => {
  const found = (markdown: string, text: string): boolean => diffAgainstRoleTable(markdown).some((diff) => diff.includes(text));

  it('確定させる人の入れ替え', () => {
    assert.ok(found(mutate('| person | adr / decision-log |', '| ai | adr / decision-log |'), 'adr: 確定させる人が違う'));
  });

  it('kind の削除・追加・重複', () => {
    assert.ok(found(mutate('| ai | tasks | `ai/specs/tasks/NN-slug.md` | — |\n', ''), 'ROLE_OF_KIND にあって表に無い kind: tasks'));
    assert.ok(found(mutate('| client | delivery-chapter / proposal |', '| client | delivery-chapter / proposal / newsletter |'), '表にあって ROLE_OF_KIND に無い kind: newsletter'));
    assert.ok(found(mutate('| ai | tasks |', '| ai | tasks / glossary |'), '表の kind が重複している: glossary'));
  });

  it('型の検査の区分・(図) の付け外し', () => {
    assert.ok(found(mutate('| ○ / ○ / — |', '| ○ / — / — |'), 'screen-spec: 型の検査の区分が違う'));
    assert.ok(
      found(
        mutate('| person | glossary | `person/design/shared/NN-glossary.md` | — |', '| person | glossary | `person/design/shared/NN-glossary.md` | ○ |'),
        'glossary: 型の検査の区分が違う',
      ),
    );
    assert.ok(found(mutate('screen-spec (図)', 'screen-spec'), 'screen-spec: 図が要るかが違う'));
    assert.ok(found(mutate('as-is-overview (図)', 'as-is-overview'), 'as-is-overview: 図が要るかが違う'));
  });

  it('置き場所のフォルダの取り違え・並べ替え・追加', () => {
    assert.ok(found(mutate('{flows,screens,features}', '{flows,screens,notes}'), '置き場所のフォルダが違う'));
    assert.ok(found(mutate('{flows,screens,features}', '{screens,flows,features}'), 'business-flow: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`ai/specs/<c>/contract.md`', '`ai/specs/contracts/<c>.md`'), 'context-contract: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`person/decisions/01-decisions.md`', '`person/decisions/ledger/01-decisions.md`'), 'decision-log: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`ai/specs/shared/NN-*.md` (固定番号)', '`ai/specs/common/NN-*.md` (固定番号)'), '置き場所のフォルダが違う'));
  });

  it('15 本の対象外・1 フォルダの上限・kind の数', () => {
    assert.ok(found(mutate('`client/proposals/<year>/`', ''), '15 本の対象外のフォルダが違う'));
    assert.ok(found(mutate('15 本の対象外', '16 本の対象外'), '1 フォルダの上限が違う'));
    assert.ok(found(mutate('計 47 kind (person 18・ai 27・client 2)', '計 47 kind (person 17・ai 28・client 2)'), 'kind の数が違う'));
  });

  it('節や表が消えたとき', () => {
    assert.deepEqual(diffAgainstRoleTable('# 見出しだけ\n'), ['「## 7.」の節が無い']);
    assert.deepEqual(diffAgainstRoleTable('## 7. 節だけ\n\n本文だけで表が無い\n'), ['kind の置き場所の表が無い']);
  });
});
