// node --test dist/core/TaxonomyGuideSync.test.js
// 置き場所の正本 (要件定義書 02 §7 の表) と、コード側の表 (Role.ts の ROLE_OF_KIND)、文書体系の手引きの「kind の置き場所」の
// 表の突き合わせ (ADR-0005 決定 2、ADR-0009、テスト仕様 06 の I12)。表を直したのに転記を直し忘れた (逆も) と、ここで落ちる。
//
// §7 とコードで突き合わせる項目: kind の集合 / 確定させる人 / 型の検査の区分 / 置き場所のフォルダと
// ファイル名 / 「15 本の対象外」/ 1 フォルダの上限 / 区分ごとの kind の数。
// 図が要る kind と図種は §8 (テスト仕様 08 の TST-108・315) とコードの diagrams を突き合わせ、手引き §4・解説 09 §3 の「16 kind」の
// 書き方が §8 の kind 数と合うことも見る。
// 文書体系の手引き (templates/docs/ai/handbook/how-to/01-document-taxonomy.md) の「kind の置き場所」の節は、§7 の転記なので、
// 表の行 (kind の表と「決まり」の表) が 1 行ずつ同じことを見る。
//
// 表の読み方は diffAgainstRoleTable・diffGuideAgainstRequirements に閉じ、表を書き換えた文書 (kind の削除・確定させる人の
// 入れ替え・フォルダの取り違えなど) を渡して「食い違いを見つけること」も確かめる。1 行に kind が複数 (`a / b (図) / c`) 書かれた
// 行は、型の検査の区分とフォルダも、同じ順に並んだものとして読む。
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
import type { DiagramKind, FormCheck } from './Role.js';

/** 置き場所の正本の文書の id。場所ではなく id で探す (Igeta 自身の docs/ を移しても、このテストは動く。REQ-302) */
const REQUIREMENTS_ID = 'audience-directories';

/** 文書体系の手引き (利用 repo には写さず、AGENTS.md と docs/README.md から版に固定したものを指す) */
const GUIDE_PATH = join(IGETA_ROOT, 'templates', 'docs', 'ai', 'handbook', 'how-to', '01-document-taxonomy.md');

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
    const matched = /^([a-z][a-z0-9-]*)$/.exec(part.trim());
    if (matched === null) return null;
    entries.push({ kind: matched[1] ?? '' });
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

/**
 * 置き場所の欄のファイル名。連番つきの任意の名前 (`NN-slug.md`・`NNNN-slug.md`・`NN-*.md`) と、フォルダだけの指定
 * (末尾が `/`) は「任意の .md」(`*.md`)、`NN-<kind>.md` は行の kind ごとの名前、それ以外 (`00-map.md`・`contract.md`・
 * `NN-glossary.md` など) はそのまま。相対の補足 (`how-to/02-implementation-order.md`) のファイル名も読む。
 * フォルダを含まないコードスパン (置かない kind の欄の `AGENTS.md`) は、置き場所ではないので読まない。
 */
function tableNames(placeCell: string, kinds: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const span of placeCell.matchAll(/`([^`]*\/[^`]*)`/g)) {
    for (const expanded of expandBraces(span[1] ?? '')) {
      const name = expanded.endsWith('/') ? '*.md' : posix.basename(expanded);
      if (/^(?:NN|NNNN)-(?:slug|\*)\.md$/.test(name)) names.add('*.md');
      else if (name === 'NN-<kind>.md') kinds.forEach((kind) => names.add(`NN-${kind}.md`));
      else names.add(name);
    }
  }
  return names;
}

/** コード側のパターンのファイル名 (分けた先も同じ名前なので、そのまま) */
function codeNames(kinds: readonly string[]): Set<string> {
  return new Set(kinds.flatMap((kind) => (ROLE_OF_KIND.get(kind)?.patterns ?? []).map((pattern) => posix.basename(pattern))));
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

    // 置き場所のファイル名 (固定の名前は、その名前でしか置けない kind の目印になる)
    const kindNames = row.kinds.map((entry) => entry.kind);
    const names = tableNames(row.placeCell, kindNames);
    const codeSide = codeNames(kindNames);
    if (!sameSet(names, codeSide)) diffs.push(`${label}: 置き場所のファイル名が違う (表 ${show(names)} / コード ${show(codeSide)})`);
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

/** 「## N.」の節の行 (見出しの次から、次の `## ` の手前まで)。節が無ければ null */
function sectionLines(markdown: string, number: number): readonly string[] | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${number}\\.\\s`).test(line));
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, next === -1 ? undefined : next);
}

/** 要件定義書 02 §8 の読み取り結果: 行ごとの kind と図種、図が要らない kind */
interface DiagramTable {
  readonly rows: readonly { readonly kinds: readonly string[]; readonly diagrams: readonly string[] }[];
  readonly noDiagramKinds: readonly string[];
}

function readDiagramTable(markdown: string): DiagramTable | string {
  const lines = sectionLines(markdown, 8);
  if (lines === null) return '「## 8.」の節が無い';
  const table = tablesOf(lines).find((candidate) => candidate.header[0] === 'kind');
  if (table === undefined) return '§8 に kind と図種の表が無い';
  const rows: { kinds: string[]; diagrams: string[] }[] = [];
  for (const cells of table.rows) {
    const kinds = (cells[0] ?? '').split('/').map((kind) => kind.trim());
    const diagrams = (cells[1] ?? '').split('/').map((diagram) => diagram.trim());
    if (kinds.some((kind) => !/^[a-z][a-z0-9-]*$/.test(kind)) || diagrams.some((diagram) => !/^[A-Za-z]+$/.test(diagram))) {
      return `§8 の表の行が読めない: ${cells.join(' | ')}`;
    }
    rows.push({ kinds, diagrams });
  }
  const none = /^図が要らない kind: (.+?)(?:\s*\(|。|$)/m.exec(lines.join('\n'));
  if (none === null) return '§8 に「図が要らない kind: …」の行が無い';
  return { rows, noDiagramKinds: (none[1] ?? '').split('・').map((kind) => kind.trim()) };
}

type DiagramsOfKind = ReadonlyMap<string, readonly DiagramKind[]>;

const codeDiagrams: DiagramsOfKind = new Map([...ROLE_OF_KIND.entries()].map(([kind, placement]) => [kind, placement.diagrams]));

/** 要件定義書 02 §8 と、コード (Role.ts の diagrams) の食い違い。1 行に kind が複数ある行は、全部の kind が同じ図種 */
function diffAgainstDiagramTable(markdown: string, code: DiagramsOfKind = codeDiagrams): string[] {
  const table = readDiagramTable(markdown);
  if (typeof table === 'string') return [table];
  const diffs: string[] = [];
  const inTable = new Set<string>();
  for (const row of table.rows) {
    for (const kind of row.kinds) {
      if (inTable.has(kind)) diffs.push(`§8 の kind が重複している: ${kind}`);
      inTable.add(kind);
      const actual = code.get(kind);
      if (actual === undefined) {
        diffs.push(`§8 にあって ROLE_OF_KIND に無い kind: ${kind}`);
      } else if (!sameSet(new Set(row.diagrams), new Set(actual))) {
        diffs.push(`${kind}: 許す図種が違う (§8 ${show(row.diagrams)} / コード ${show(actual)})`);
      }
    }
  }
  for (const [kind, diagrams] of code) {
    if (inTable.has(kind)) continue;
    // §8 は person の kind の表。ai・client の kind は、図種を持たなければよい
    if (ROLE_OF_KIND.get(kind)?.role === 'person' && !table.noDiagramKinds.includes(kind)) diffs.push(`${kind}: §8 の表にも「図が要らない kind」にも無い`);
    if (diagrams.length > 0) diffs.push(`${kind}: §8 では図が要らないが、コードは図種を持つ ${show(diagrams)}`);
  }
  for (const kind of table.noDiagramKinds) if (inTable.has(kind)) diffs.push(`${kind}: §8 の表と「図が要らない kind」の両方にある`);
  if (!sameSet(new Set(table.noDiagramKinds), new Set(['adr', 'feature-brief']))) {
    diffs.push(`図が要らない kind は adr・feature-brief の 2 つ (§8: ${show(table.noDiagramKinds)})`);
  }
  return diffs;
}

/** 手引き §4・解説 09 §3 の「図」の項は、「16 kind・要件 02 §8」と書き、kind の列挙を持たない (§8 の kind 数と合う) */
function diffDiagramProse(label: string, text: string, sectionNumber: number, requirementsText: string): string[] {
  const table = readDiagramTable(requirementsText);
  if (typeof table === 'string') return [table];
  const count = table.rows.reduce((sum, row) => sum + row.kinds.length, 0);
  const line = (sectionLines(text, sectionNumber) ?? []).find((candidate) => candidate.includes('**図**'));
  if (line === undefined) return [`${label}: 「図」の項が無い`];
  const diffs: string[] = [];
  const written = /(\d+) kind/.exec(line);
  if (written === null || Number(written[1]) !== count) diffs.push(`${label}: 「${count} kind」と書く (書いてある: ${written?.[0] ?? 'なし'})`);
  if (!line.includes('§8')) diffs.push(`${label}: 正本が要件 02 §8 だと書く`);
  const listed = table.rows.flatMap((row) => row.kinds).filter((kind) => line.includes(kind));
  if (listed.length > 0) diffs.push(`${label}: 図が要る kind を列挙しない (書いてある: ${listed.join('・')})`);
  return diffs;
}

const tableLinesOf = (lines: readonly string[]): string[] => lines.filter((line) => line.trim().startsWith('|')).map((line) => line.trim());

/** 手引きの「kind の置き場所」の節の表の行 (見出しの次から、次の `## ` の手前まで)。節が無ければ null */
function guideTableLines(guide: string): string[] | null {
  const lines = guide.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+\d+\.\s+kind の置き場所/.test(line));
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return tableLinesOf(lines.slice(start + 1, next === -1 ? undefined : next));
}

/** 要件定義書 02 §7 と、手引きの「kind の置き場所」の節の、表の行の食い違いを、メッセージの一覧で返す。食い違いが無ければ空 */
function diffGuideAgainstRequirements(guide: string, requirementsText: string): string[] {
  const actual = guideTableLines(guide);
  if (actual === null) return ['手引きに「kind の置き場所」の節が無い'];
  const expected = tableLinesOf(section7Lines(requirementsText) ?? []);
  const diffs = [
    ...expected.filter((row) => !actual.includes(row)).map((row) => `手引きに無い、または書き換わっている行 (§7 の行): ${row}`),
    ...actual.filter((row) => !expected.includes(row)).map((row) => `手引きにだけある、または書き換わっている行: ${row}`),
  ];
  if (diffs.length === 0 && expected.join('\n') !== actual.join('\n')) diffs.push('表の行の順が違う');
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
const guide = readFileSync(GUIDE_PATH, 'utf8');

/** 要件定義書の §7 の中の文字列を 1 か所だけ書き換える。書き換え元が無ければテストの前提が崩れているので落とす */
function mutate(from: string, to: string): string {
  const section = requirements.search(/^##\s+7\.\s/m);
  const at = section === -1 ? -1 : requirements.indexOf(from, section);
  assert.notEqual(at, -1, `要件定義書 02 の §7 に見つからない: ${from}`);
  return `${requirements.slice(0, at)}${to}${requirements.slice(at + from.length)}`;
}

/** 要件定義書の §8 の中の文字列を 1 か所だけ書き換える */
function mutateDiagrams(from: string, to: string): string {
  const section = requirements.search(/^##\s+8\.\s/m);
  const at = section === -1 ? -1 : requirements.indexOf(from, section);
  assert.notEqual(at, -1, `要件定義書 02 の §8 に見つからない: ${from}`);
  return `${requirements.slice(0, at)}${to}${requirements.slice(at + from.length)}`;
}

describe('TaxonomyGuideSync: 要件定義書 02 §7 と ROLE_OF_KIND', () => {
  it('[TST-108] §7・手引き・ROLE_OF_KIND の 3 つで、47 kind の置き場所と型の検査の区分が全部同じ (§7 とコードは項目ごと、手引きは表の行が 1 行ずつ同じ)', () => {
    assert.deepEqual(diffAgainstRoleTable(requirements), []);
    assert.deepEqual(diffGuideAgainstRequirements(guide, requirements), []);
  });

  it('[TST-108 / spec 08] §8・Role.ts の diagrams・手引き §4・解説 09 §3 で、16 kind の図種が一致し、図が要らない kind は adr・feature-brief の 2 つで、本文の「16」が §8 の kind 数と合う', () => {
    assert.deepEqual(diffAgainstDiagramTable(requirements), []);
    const explanation = readFileSync(join(IGETA_ROOT, 'docs', 'explanation', '09-reader-granularity.md'), 'utf8');
    assert.deepEqual(diffDiagramProse('手引き §4', guide, 4, requirements), []);
    assert.deepEqual(diffDiagramProse('解説 09 §3', explanation, 3, requirements), []);
    const table = readDiagramTable(requirements);
    assert.ok(typeof table !== 'string');
    assert.equal(table.rows.flatMap((row) => row.kinds).length, 16);
    assert.deepEqual(table.noDiagramKinds, ['adr', 'feature-brief']);
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
      { kind: 'business-flow' },
      { kind: 'screen-spec' },
      { kind: 'feature-brief' },
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

  it('型の検査の区分の書き換え', () => {
    assert.ok(found(mutate('| ○ / ○ / — |', '| ○ / — / — |'), 'screen-spec: 型の検査の区分が違う'));
    assert.ok(
      found(
        mutate('| person | glossary | `person/design/shared/NN-glossary.md` | — |', '| person | glossary | `person/design/shared/NN-glossary.md` | ○ |'),
        'glossary: 型の検査の区分が違う',
      ),
    );
  });

  it('置き場所のフォルダの取り違え・並べ替え・追加', () => {
    assert.ok(found(mutate('{flows,screens,features}', '{flows,screens,notes}'), '置き場所のフォルダが違う'));
    assert.ok(found(mutate('{flows,screens,features}', '{screens,flows,features}'), 'business-flow: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`ai/specs/<c>/contract.md`', '`ai/specs/contracts/<c>.md`'), 'context-contract: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`person/decisions/01-decisions.md`', '`person/decisions/ledger/01-decisions.md`'), 'decision-log: 置き場所のフォルダが違う'));
    assert.ok(found(mutate('`ai/specs/shared/NN-*.md` (固定番号)', '`ai/specs/common/NN-*.md` (固定番号)'), '置き場所のフォルダが違う'));
  });

  it('置き場所のファイル名の取り違え (固定の名前・kind を含む名前・任意の名前の追加)', () => {
    assert.ok(found(mutate('`person/design/shared/00-map.md`', '`person/design/shared/01-map.md`'), '置き場所のファイル名が違う'));
    assert.ok(found(mutate('`ai/specs/<c>/contract.md`', '`ai/specs/<c>/interface.md`'), 'context-contract: 置き場所のファイル名が違う'));
    assert.ok(found(mutate('`person/design/shared/NN-glossary.md`', '`person/design/shared/NN-terms.md`'), 'glossary: 置き場所のファイル名が違う'));
    assert.ok(found(mutate('`person/design/<c>/NN-<kind>.md`', '`person/design/<c>/NN-slug.md`'), '置き場所のファイル名が違う'));
    assert.ok(found(mutate('`person/decisions/01-decisions.md`', '`person/decisions/01-ledger.md`'), 'adr / decision-log: 置き場所のファイル名が違う'));
    assert.ok(found(mutate('`how-to/02-implementation-order.md`', '`how-to/03-implementation-order.md`'), '置き場所のファイル名が違う'));
    assert.ok(found(mutate('`person/requirements/01-requirements.md`', '`person/requirements/00-requirements.md`'), 'requirements: 置き場所のファイル名が違う'));
  });

  it('15 本の対象外・1 フォルダの上限・kind の数', () => {
    assert.ok(found(mutate('`client/proposals/<year>/`', ''), '15 本の対象外のフォルダが違う'));
    assert.ok(found(mutate('15 本の対象外', '16 本の対象外'), '1 フォルダの上限が違う'));
    assert.ok(found(mutate('計 47 kind (person 18・ai 27・client 2)', '計 47 kind (person 17・ai 28・client 2)'), 'kind の数が違う'));
  });

  it('[TST-315 / spec 08] §8 の食い違い: 1 行の図種を変える / 複数 kind の行の片方の kind を消す / Role.ts の diagrams を 1 つ変える / 旧い列挙を戻す / 本文の「16」を変える', () => {
    const diagrams = (markdown: string, code?: DiagramsOfKind): string[] => diffAgainstDiagramTable(markdown, code);
    assert.ok(diagrams(mutateDiagrams('| risks-tech-debt | quadrantChart |', '| risks-tech-debt | flowchart |')).some((diff) => diff.includes('risks-tech-debt: 許す図種が違う')));
    assert.ok(diagrams(mutateDiagrams('| solution-strategy / as-is-overview |', '| solution-strategy |')).some((diff) => diff.includes('as-is-overview: §8 の表にも')));
    const changed = new Map(codeDiagrams);
    changed.set('operations', ['sequenceDiagram']);
    assert.ok(diagrams(requirements, changed).some((diff) => diff.includes('operations: 許す図種が違う')));
    assert.ok(diagrams(mutateDiagrams('図が要らない kind: adr・feature-brief', '図が要らない kind: adr')).some((diff) => diff.includes('図が要らない kind は adr・feature-brief')));

    const guideProse = (text: string): string[] => diffDiagramProse('手引き §4', text, 4, requirements);
    const explanation = readFileSync(join(IGETA_ROOT, 'docs', 'explanation', '09-reader-granularity.md'), 'utf8');
    const explanationProse = (text: string): string[] => diffDiagramProse('解説 09 §3', text, 3, requirements);
    assert.ok(guideProse(guide.replace('図が要る 16 kind', '図が要る 15 kind')).some((diff) => diff.includes('「16 kind」と書く')));
    assert.ok(guideProse(guide.replace('図が要る 16 kind', '図が要る map・context-map・business-flow・screen-spec・solution-strategy・as-is-overview の 6 kind')).length > 0);
    assert.ok(explanationProse(explanation.replace('16 kind は', '17 kind は')).some((diff) => diff.includes('「16 kind」と書く')));
    assert.ok(explanationProse(explanation.replace('16 kind は', 'map・business-flow は')).length > 0);
  });

  it('[TST-305] 手引きがずれる: 手引きの表の 1 行の置き場所を書き換える / 1 行を消すと、§7 との突き合わせが食い違いを見つける', () => {
    /** 手引きの「kind の置き場所」の節の中の文字列を 1 か所だけ書き換える */
    const mutateGuide = (from: string, to: string): string => {
      const section = guide.search(/^##\s+\d+\.\s+kind の置き場所/m);
      const at = section === -1 ? -1 : guide.indexOf(from, section);
      assert.notEqual(at, -1, `手引きの「kind の置き場所」の節に見つからない: ${from}`);
      return `${guide.slice(0, at)}${to}${guide.slice(at + from.length)}`;
    };
    const diffsOf = (mutated: string): string[] => diffGuideAgainstRequirements(mutated, requirements);

    const rewritten = diffsOf(mutateGuide('`ai/specs/tasks/NN-slug.md`', '`ai/specs/jobs/NN-slug.md`'));
    assert.ok(rewritten.some((diff) => diff.includes('ai/specs/jobs/NN-slug.md')), rewritten.join('\n'));
    assert.ok(rewritten.some((diff) => diff.includes('ai/specs/tasks/NN-slug.md')), rewritten.join('\n'));

    const removed = diffsOf(mutateGuide('| client | delivery-chapter / proposal | `client/delivery/<提出物名>/` / `client/proposals/<year>/NN-slug.md` | — |\n', ''));
    assert.ok(removed.some((diff) => diff.includes('delivery-chapter / proposal')), removed.join('\n'));
  });

  it('節や表が消えたとき', () => {
    assert.deepEqual(diffAgainstRoleTable('# 見出しだけ\n'), ['「## 7.」の節が無い']);
    assert.deepEqual(diffAgainstRoleTable('## 7. 節だけ\n\n本文だけで表が無い\n'), ['kind の置き場所の表が無い']);
  });
});
