// node --test dist/checks/TemplatesPersonForm.test.js
// person・client の雛形が、人の型を満たすこと (ADR-0002 条件 5〜7・10、docs/explanation/09-reader-granularity.md §3)。
//   結論 (TL;DR 3 行まで) → 図 (図が要る kind) → 決まりの表 (行頭が自分の ID の行は、列の数が見出しと同じで、最後の列が 状態) →
//   決めてほしいこと → 関連 (上流は文書、下流の欄は「(生成索引が出す)」)。
//   HTML コメント (指示) を書かない。生成器が管理する区間 (AUTOGEN の dir-index・adr-index・tentative-index) だけが例外。
// 型の検査が ○ の kind (src/core/Role.ts の formCheck が full) は、状態・決めてほしいこと・行数・図まで見る。
// テストは規則ごとに 1 本。全部の雛形を回し、規則に外れた雛形を全部出す。
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import type { FrontmatterData } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { placementOf } from '../core/Role.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');
const STATES: ReadonlySet<string> = new Set(['決定', '仮', '未決', '廃']);
const GENERATED_REGIONS: ReadonlySet<string> = new Set(['dir-index', 'adr-index', 'tentative-index']);
const QUESTION_HEADER = ['問い', '対象 ID', '選択肢', '決まらないと止まること'];

interface Doc {
  readonly relPath: string;
  readonly lines: readonly string[];
  readonly bodyStart: number;
  readonly data: FrontmatterData;
  readonly kind: string | undefined;
}

function listDocs(role: 'person' | 'client'): readonly Doc[] {
  return globSync(`${role}/**/*.md`, { cwd: TEMPLATES_DIR })
    .map((file) => file.split('\\').join('/'))
    .sort()
    .map((relPath) => {
      const lines = readFileSync(join(TEMPLATES_DIR, relPath), 'utf8').split(/\r?\n/);
      const meta = parseFrontmatter(lines);
      assert.ok(meta !== null, `${relPath}: frontmatter が無い`);
      return { relPath, lines, bodyStart: meta.bodyStart, data: meta.data, kind: scalar(meta.data, 'kind') };
    });
}

const personDocs = listDocs('person');
const clientDocs = listDocs('client');
/** kind を持つ person の雛形 (索引の README.md を除く) */
const personKindDocs = personDocs.filter((doc) => doc.kind !== undefined);
const formOf = (doc: Doc): string | undefined => (doc.kind === undefined ? undefined : placementOf(doc.kind)?.formCheck);
const fullDocs = personKindDocs.filter((doc) => formOf(doc) === 'full');

const splitCells = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

interface Table {
  /** 1 始まりの行番号 (見出し行) */
  readonly line: number;
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** コードフェンス外・生成区間外の表 */
function tablesOf(doc: Doc): readonly Table[] {
  const kinds = classifyLines(doc.lines);
  const tables: Table[] = [];
  let current: { line: number; rows: string[][] } | null = null;
  const flush = (): void => {
    if (current !== null && current.rows.length >= 2) {
      tables.push({ line: current.line, header: current.rows[0] ?? [], rows: current.rows.slice(2) });
    }
    current = null;
  };
  doc.lines.forEach((line, index) => {
    if (index < doc.bodyStart || kinds[index] !== 'body' || !line.trim().startsWith('|')) {
      flush();
      return;
    }
    current ??= { line: index + 1, rows: [] };
    current.rows.push(splitCells(line));
  });
  flush();
  return tables;
}

/** コードフェンス外の H2 見出し (連番は外さない) と、1 始まりの行番号 */
function h2sOf(doc: Doc): readonly { readonly text: string; readonly line: number }[] {
  const kinds = classifyLines(doc.lines);
  return doc.lines.flatMap((line, index) => {
    const matched = index >= doc.bodyStart && kinds[index] === 'body' ? /^##\s+(.*?)\s*$/.exec(line) : null;
    return matched === null ? [] : [{ text: matched[1] ?? '', line: index + 1 }];
  });
}

const prefixesOf = (doc: Doc): readonly string[] => {
  const list = stringList(doc.data, 'id_prefixes');
  const single = scalar(doc.data, 'id_prefix');
  return list.length > 0 ? list : single === undefined ? [] : [single];
};

const isQuestionTable = (table: Table): boolean => table.header.join('|') === QUESTION_HEADER.join('|');
const firstDiagramLine = (doc: Doc): number => doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^```mermaid\s*$/.test(line)) + 1;

/** 雛形ごとに規則を当て、外れた点を「パス: 内容」で全部並べる。空なら通る */
function problems(docs: readonly Doc[], rule: (doc: Doc) => readonly string[]): readonly string[] {
  return docs.flatMap((doc) => rule(doc).map((problem) => `${doc.relPath}: ${problem}`));
}

describe('person・client の雛形: 人の型 (ADR-0002 条件 5〜7・10)', () => {
  it('指示の HTML コメントと frontmatter の行末コメントを書かない。生成器が管理する区間 (AUTOGEN) だけが例外', () => {
    assert.deepEqual(
      problems([...personDocs, ...clientDocs], (doc) => {
        const kinds = classifyLines(doc.lines);
        return doc.lines.flatMap((line, index) => {
          const found: string[] = [];
          if (kinds[index] === 'html-comment') found.push(`${index + 1} 行目に HTML コメントがある: ${line.trim()}`);
          const marker = /<!--\s*AUTOGEN:([a-z-]+):(?:start|end)/.exec(line)?.[1];
          if (marker !== undefined && !GENERATED_REGIONS.has(marker)) found.push(`${index + 1} 行目は生成器が管理する区間ではない: ${marker}`);
          // frontmatter の行末コメント (# …) も、描画では見えない書き込み口になる。指示は文書体系ガイドに置く
          if (index > 0 && index < doc.bodyStart - 1 && /(^|\s)#(\s|$)/.test(line)) found.push(`${index + 1} 行目の frontmatter にコメントがある: ${line.trim()}`);
          return found;
        });
      }),
      [],
    );
  });

  it('結論 (TL;DR) は 3 行まで、ID を書かない', () => {
    assert.deepEqual(
      problems(personKindDocs, (doc) => {
        const start = doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^>\s*\*\*TL;DR\*\*/.test(line));
        if (start === -1) return ['TL;DR が無い'];
        let end = start;
        while ((doc.lines[end + 1] ?? '').startsWith('>')) end += 1;
        return [
          ...(end - start + 1 > 3 ? [`TL;DR が ${end - start + 1} 行ある (3 行まで)`] : []),
          ...(/\b[A-Z][A-Z0-9]*-\d{3}\b/.test(doc.lines.slice(start, end + 1).join('\n')) ? ['TL;DR に ID がある'] : []),
        ];
      }),
      [],
    );
  });

  it('関連の下流の欄は「(生成索引が出す)」', () => {
    assert.deepEqual(
      problems(personKindDocs, (doc) => (/下流[^\n]*\(生成索引が出す\)/.test(doc.lines.slice(doc.bodyStart).join('\n')) ? [] : ['関連の下流が (生成索引が出す) ではない'])),
      [],
    );
  });

  it('図が要る kind (地図・まとまりの地図・業務フロー・画面・解決戦略・現行構成) は、図 (Mermaid) が最初の表より前にある', () => {
    const diagramDocs = personKindDocs.filter((doc) => doc.kind !== undefined && placementOf(doc.kind)?.needsDiagram === true);
    assert.ok(diagramDocs.length > 0, '図が要る kind の雛形が見つからない');
    assert.deepEqual(
      problems(diagramDocs, (doc) => {
        const diagram = firstDiagramLine(doc);
        const firstTable = tablesOf(doc)[0];
        if (diagram === 0) return ['図が無い'];
        return firstTable !== undefined && diagram > firstTable.line ? [`図 (${diagram} 行目) が最初の表 (${firstTable.line} 行目) より後ろにある`] : [];
      }),
      [],
    );
  });

  it('型の検査が ○ でない kind (地図・まとまりの地図・機能ブリーフ・用語集) が「決めてほしいこと」を置くなら、任意の節で、表の列が同じ', () => {
    const optionalDocs = personKindDocs.filter((doc) => formOf(doc) !== 'full' && h2sOf(doc).some((h2) => h2.text.startsWith('決めてほしいこと')));
    assert.ok(optionalDocs.length > 0, '「決めてほしいこと」を置く雛形が見つからない');
    assert.deepEqual(
      problems(optionalDocs, (doc) => [
        ...(h2sOf(doc).some((h2) => h2.text === '決めてほしいこと (任意)') ? [] : ['見出しが「決めてほしいこと (任意)」ではない']),
        ...(tablesOf(doc).filter(isQuestionTable).length === 1 ? [] : ['決めてほしいことの表が 1 つではない']),
        ...(h2sOf(doc).at(-1)?.text === '関連' ? [] : ['関連が最後の節ではない']),
      ]),
      [],
    );
  });
});

describe('person の雛形のうち、型の検査が ○ の kind: 状態・決めてほしいこと・行数', () => {
  it('決まりの表が 1 つ以上あり、行頭が自分の ID の行は、列の数が見出しと同じで、最後の列が 状態 で、値が 決定・仮・未決・廃', () => {
    assert.ok(fullDocs.length > 0, '型の検査が ○ の雛形が見つからない');
    assert.deepEqual(
      problems(fullDocs, (doc) => {
        const prefixes = prefixesOf(doc);
        if (prefixes.length === 0) return ['id_prefix が無い'];
        const idRow = (row: readonly string[]): boolean => prefixes.some((prefix) => new RegExp(`^${prefix}-\\d{3}$`).test(row[0] ?? ''));
        const decisionTables = tablesOf(doc).filter((table) => table.rows.some(idRow));
        if (decisionTables.length === 0) return ['行頭が自分の ID の表が無い'];
        return decisionTables.flatMap((table) => [
          ...(table.header[table.header.length - 1] === '状態' ? [] : [`${table.line} 行目の表の最後の列が 状態 ではない`]),
          ...table.rows.filter(idRow).flatMap((row) => {
            const state = row[row.length - 1] ?? '';
            return [
              ...(row.length === table.header.length ? [] : [`${row[0]} の列の数が見出しと違う (見出し ${table.header.length} 列、行 ${row.length} 列)`]),
              ...(STATES.has(state) ? [] : [`${row[0]} の状態が 決定・仮・未決・廃 ではない: ${state}`]),
            ];
          }),
        ]);
      }),
      [],
    );
  });

  it('決めてほしいこと (| 問い | 対象 ID | 選択肢 | 決まらないと止まること |) の表が 1 つあり、その節の次が関連で、関連が最後の節', () => {
    assert.deepEqual(
      problems(fullDocs, (doc) => {
        const h2s = h2sOf(doc);
        const questions = tablesOf(doc).filter(isQuestionTable);
        return [
          ...(h2s.at(-1)?.text === '関連' ? [] : ['関連が最後の節ではない']),
          ...(h2s.at(-2)?.text === '決めてほしいこと' ? [] : ['関連の前の節が「決めてほしいこと」ではない']),
          ...(questions.length === 1 && (questions[0]?.line ?? 0) > (h2s.at(-2)?.line ?? 0) ? [] : ['決めてほしいことの表が、その節の中に 1 つだけある形ではない']),
        ];
      }),
      [],
    );
  });

  it('line_limit は 100 (requirements は 150) で、雛形がその行数に収まる', () => {
    assert.deepEqual(
      problems(fullDocs, (doc) => {
        const limit = doc.kind === 'requirements' ? 150 : 100;
        const kinds = classifyLines(doc.lines);
        const total = doc.lines.length - (doc.lines[doc.lines.length - 1] === '' ? 1 : 0) - kinds.filter((kind) => kind === 'autogen').length;
        return [
          ...(scalar(doc.data, 'line_limit') === String(limit) ? [] : [`line_limit が ${limit} ではない`]),
          ...(total <= limit ? [] : [`${total} 行 (上限 ${limit})`]),
        ];
      }),
      [],
    );
  });
});
