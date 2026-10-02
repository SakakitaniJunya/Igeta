// node --test dist/checks/TemplatesPersonForm.test.js
// person・client の雛形が、人の型を満たすこと (ADR-0002 条件 5〜7・10、docs/explanation/09-reader-granularity.md §3)。
//   結論 (TL;DR 3 行まで) → 図 (図が要る kind) → 決まりの表 (行頭が自分の ID の行は最後の列が 状態) →
//   決めてほしいこと → 関連 (上流は文書、下流の欄は「(生成索引が出す)」)。
//   HTML コメント (指示) を書かない。生成器が管理する区間 (AUTOGEN の dir-index・adr-index・tentative-index) だけが例外。
// 型の検査が ○ の kind (src/core/Role.ts の formCheck が full) は、状態・決めてほしいこと・行数・図まで見る。
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import type { FrontmatterData } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { placementOf, ROLE_OF_KIND } from '../core/Role.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');
const STATES: ReadonlySet<string> = new Set(['決定', '仮', '未決', '廃']);
const GENERATED_REGIONS: ReadonlySet<string> = new Set(['dir-index', 'adr-index', 'tentative-index']);
const QUESTION_HEADER = ['問い', '対象 ID', '選択肢', '決まらないと止まること'];
const DOWNSTREAM = '(生成索引が出す)';

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

describe('person・client の雛形: 指示の HTML コメントを書かない (ADR-0002 条件 10)', () => {
  for (const doc of [...personDocs, ...clientDocs]) {
    it(doc.relPath, () => {
      const kinds = classifyLines(doc.lines);
      doc.lines.forEach((line, index) => {
        assert.notEqual(kinds[index], 'html-comment', `${doc.relPath}:${index + 1} HTML コメントがある: ${line.trim()}`);
        const marker = /<!--\s*AUTOGEN:([a-z-]+):(?:start|end)/.exec(line)?.[1];
        if (marker !== undefined) {
          assert.ok(GENERATED_REGIONS.has(marker), `${doc.relPath}:${index + 1} 生成器が管理する区間ではない: ${marker}`);
        }
        // frontmatter の行末コメント (# …) も、描画では見えない書き込み口になる。指示は文書体系ガイドに置く
        if (index > 0 && index < doc.bodyStart - 1) {
          assert.ok(!/(^|\s)#(\s|$)/.test(line), `${doc.relPath}:${index + 1} frontmatter にコメントがある: ${line.trim()}`);
        }
      });
    });
  }
});

describe('person の雛形: 結論は 3 行まで、ID を書かない / 下流の欄は「(生成索引が出す)」で ai・client を指さない', () => {
  for (const doc of personDocs.filter((candidate) => candidate.kind !== undefined)) {
    it(doc.relPath, () => {
      const start = doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^>\s*\*\*TL;DR\*\*/.test(line));
      assert.notEqual(start, -1, `${doc.relPath}: TL;DR が無い`);
      let end = start;
      while ((doc.lines[end + 1] ?? '').startsWith('>')) end += 1;
      assert.ok(end - start + 1 <= 3, `${doc.relPath}: TL;DR が ${end - start + 1} 行ある (3 行まで)`);
      assert.ok(!/\b[A-Z][A-Z0-9]*-\d{3}\b/.test(doc.lines.slice(start, end + 1).join('\n')), `${doc.relPath}: TL;DR に ID がある`);

      const text = doc.lines.slice(doc.bodyStart).join('\n');
      assert.match(text, /下流[^\n]*\(生成索引が出す\)/, `${doc.relPath}: 関連の下流が ${DOWNSTREAM} ではない`);

      // person は ai・client を指さない: depends_on・relates_to (雛形の id は kind 名) と、本文のリンク
      const referenced = [...stringList(doc.data, 'depends_on'), ...stringList(doc.data, 'relates_to')];
      for (const id of referenced) {
        const role = ROLE_OF_KIND.get(id)?.role;
        assert.ok(role === undefined || role === 'person', `${doc.relPath}: ${role} の kind (${id}) を指している`);
      }
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        assert.ok(!/(^|\/)(ai|client)(\/|$)/.test(match[1] ?? ''), `${doc.relPath}: ai・client へのリンク: ${match[1]}`);
      }
    });
  }
});

describe('person の雛形のうち、型の検査が ○ の kind: 状態・決めてほしいこと・行数・図', () => {
  const fullDocs = personDocs.filter((doc) => doc.kind !== undefined && placementOf(doc.kind)?.formCheck === 'full');

  it('○ の kind は 12 (要件・機能一覧・解決戦略・非機能・権限・データの扱い・現行構成・リスク・運用・移行・業務フロー・画面)', () => {
    assert.deepEqual(fullDocs.map((doc) => doc.kind).sort(), [
      'as-is-overview',
      'business-flow',
      'data-management',
      'function-list',
      'migration-plan',
      'nonfunctional',
      'operations',
      'permission-matrix',
      'requirements',
      'risks-tech-debt',
      'screen-spec',
      'solution-strategy',
    ]);
  });

  for (const doc of fullDocs) {
    const kind = doc.kind ?? '';
    describe(`${doc.relPath} (${kind})`, () => {
      it('決まりの表が 1 つ以上あり、行頭が自分の ID の行は、最後の列が 状態 で、値が 決定・仮・未決・廃', () => {
        const prefixes = prefixesOf(doc);
        assert.ok(prefixes.length > 0, 'id_prefix が無い');
        const idRow = (row: readonly string[]): boolean => prefixes.some((prefix) => new RegExp(`^${prefix}-\\d{3}$`).test(row[0] ?? ''));
        const decisionTables = tablesOf(doc).filter((table) => table.rows.some(idRow));
        assert.ok(decisionTables.length > 0, '行頭が自分の ID の表が無い');
        for (const table of decisionTables) {
          assert.equal(table.header[table.header.length - 1], '状態', `${table.line} 行目の表の最後の列が 状態 ではない`);
          for (const row of table.rows.filter(idRow)) {
            const state = row[row.length - 1] ?? '';
            assert.ok(STATES.has(state), `${row[0]} の状態が 決定・仮・未決・廃 ではない: ${state}`);
          }
        }
      });

      it('決めてほしいこと (| 問い | 対象 ID | 選択肢 | 決まらないと止まること |) があり、関連が最後の節', () => {
        const h2s = h2sOf(doc);
        assert.equal(h2s[h2s.length - 1]?.text, '関連');
        assert.equal(h2s[h2s.length - 2]?.text, '決めてほしいこと');
        const questions = tablesOf(doc).filter((table) => table.header.join('|') === QUESTION_HEADER.join('|'));
        assert.equal(questions.length, 1, '決めてほしいことの表が 1 つ');
        assert.ok(questions[0] !== undefined && questions[0].line > (h2s[h2s.length - 2]?.line ?? 0));
      });

      it(`line_limit は ${kind === 'requirements' ? 150 : 100} で、雛形がその行数に収まる`, () => {
        const limit = kind === 'requirements' ? 150 : 100;
        assert.equal(scalar(doc.data, 'line_limit'), String(limit));
        const kinds = classifyLines(doc.lines);
        const total = doc.lines.length - (doc.lines[doc.lines.length - 1] === '' ? 1 : 0) - kinds.filter((k) => k === 'autogen').length;
        assert.ok(total <= limit, `${total} 行 (上限 ${limit})`);
      });

      if (placementOf(kind)?.needsDiagram === true) {
        it('図 (Mermaid) が 1 枚以上あり、最初の決まりの表より前にある', () => {
          const diagram = doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^```mermaid\s*$/.test(line));
          assert.notEqual(diagram, -1, '図が無い');
          const firstTable = tablesOf(doc)[0];
          assert.ok(firstTable === undefined || diagram + 1 < firstTable.line, `図 (${diagram + 1} 行目) が最初の表 (${firstTable?.line} 行目) より後ろにある`);
        });
      }
    });
  }
});

describe('person の雛形のうち、図だけを検査する kind (地図・まとまりの地図) は図があり、最初の表より前にある', () => {
  for (const doc of personDocs.filter((candidate) => candidate.kind !== undefined && placementOf(candidate.kind)?.formCheck === 'diagram')) {
    it(`${doc.relPath} (${doc.kind})`, () => {
      const diagram = doc.lines.findIndex((line, index) => index >= doc.bodyStart && /^```mermaid\s*$/.test(line));
      assert.notEqual(diagram, -1, '図が無い');
      const firstTable = tablesOf(doc)[0];
      assert.ok(firstTable === undefined || diagram + 1 < firstTable.line);
    });
  }
});

describe('person の雛形のうち、型の検査が ○ でない kind: 「決めてほしいこと」を置くなら、表の列が同じ', () => {
  for (const doc of personDocs.filter((candidate) => candidate.kind !== undefined && placementOf(candidate.kind)?.formCheck !== 'full')) {
    const heading = h2sOf(doc).find((h2) => h2.text.startsWith('決めてほしいこと'));
    if (heading === undefined) continue;
    it(`${doc.relPath} (${doc.kind})`, () => {
      assert.equal(heading.text, '決めてほしいこと (任意)');
      const questions = tablesOf(doc).filter((table) => table.header.join('|') === QUESTION_HEADER.join('|'));
      assert.equal(questions.length, 1, '決めてほしいことの表が 1 つ');
      assert.equal(h2sOf(doc).at(-1)?.text, '関連');
    });
  }
});

