// node --test dist/checks/TemplatesPersonForm.test.js
// person・client の雛形が、人の型のうち、本物の検査 (PersonFormCheck) が見ない規則を満たすこと
// (docs/explanation/09-reader-granularity.md §3): 結論 (TL;DR) は 3 行まで・ID を書かない / 図は最初の表より前 /
// 決めてほしいことの表と節の並び / 関連の下流の欄 / frontmatter に行末コメントを書かない / line_limit の宣言。
// PersonFormCheck が見る規則 (HTML コメント・生成区間・状態の値と列・図の有無・行数) は、雛形を実際の置き場所に置いて
// 本物の検査を回す TemplatesInstantiation.test.ts が見る。
// テストは規則ごとに 1 本。全部の雛形を回し、規則に外れた雛形を全部出す。
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import type { FrontmatterData } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { placementOf } from '../core/Role.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');
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

const isQuestionTable = (table: Table): boolean => table.header.join('|') === QUESTION_HEADER.join('|');
const firstDiagramLine = (doc: Doc): number => doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^```mermaid\s*$/.test(line)) + 1;

/** 雛形ごとに規則を当て、外れた点を「パス: 内容」で全部並べる。空なら通る */
function problems(docs: readonly Doc[], rule: (doc: Doc) => readonly string[]): readonly string[] {
  return docs.flatMap((doc) => rule(doc).map((problem) => `${doc.relPath}: ${problem}`));
}

describe('person・client の雛形: 人の型のうち、本物の検査が見ない規則 (ADR-0002 条件 5〜7・10)', () => {
  it('frontmatter に行末コメント (# …) を書かない。描画では見えない書き込み口になる。指示は文書体系ガイドに置く', () => {
    assert.deepEqual(
      problems([...personDocs, ...clientDocs], (doc) =>
        doc.lines.flatMap((line, index) =>
          index > 0 && index < doc.bodyStart - 1 && /(^|\s)#(\s|$)/.test(line) ? [`${index + 1} 行目の frontmatter にコメントがある: ${line.trim()}`] : [],
        ),
      ),
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

  it('図が要る kind (地図・まとまりの地図・業務フロー・画面・解決戦略・現行構成) は、図 (Mermaid) が最初の表より前にある (図の有無は PersonFormCheck が見る)', () => {
    const diagramDocs = personKindDocs.filter((doc) => doc.kind !== undefined && placementOf(doc.kind)?.needsDiagram === true);
    assert.ok(diagramDocs.length > 0, '図が要る kind の雛形が見つからない');
    assert.deepEqual(
      problems(diagramDocs, (doc) => {
        const diagram = firstDiagramLine(doc);
        const firstTable = tablesOf(doc)[0];
        return diagram !== 0 && firstTable !== undefined && diagram > firstTable.line ? [`図 (${diagram} 行目) が最初の表 (${firstTable.line} 行目) より後ろにある`] : [];
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

describe('person の雛形のうち、型の検査が ○ の kind: 決めてほしいこと・line_limit', () => {
  it('決めてほしいこと (| 問い | 対象 ID | 選択肢 | 決まらないと止まること |) の表が 1 つあり、その節の次が関連で、関連が最後の節', () => {
    assert.ok(fullDocs.length > 0, '型の検査が ○ の雛形が見つからない');
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

  it('line_limit は 100 (requirements は 150) を宣言している (行数そのものは PersonFormCheck が見る)', () => {
    assert.deepEqual(
      problems(fullDocs, (doc) => {
        const limit = doc.kind === 'requirements' ? 150 : 100;
        return scalar(doc.data, 'line_limit') === String(limit) ? [] : [`line_limit が ${limit} ではない`];
      }),
      [],
    );
  });
});
