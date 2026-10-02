// node --test dist/checks/TemplateSectionAudit.test.js
// 雛形の節の監査 (docs/explanation/12-template-section-audit.md。ADR-0010 の受入条件) の表 A が、ai の雛形の全部の節を
// 1 回ずつ載せていて、答えが全部「変わらない」(「変わる」は 0 件) であること。
// 監査の文書は、場所ではなく id で探す (Igeta 自身の docs/ を移しても、このテストは動く。REQ-302)。
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listDocFiles } from '../core/DocFiles.js';
import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { placementOf } from '../core/Role.js';

const AUDIT_ID = 'template-section-audit';
const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');

/** 連番 (`1.`) と「(任意)」を外した見出し。監査の表の「節」と同じ書き方 */
const normalizeHeading = (heading: string): string =>
  heading.replace(/^\d+(\.\d+)*[.．]?\s*/, '').replace(/\s*\(任意\)$/, '').trim();

/** ai の雛形 (.md) の kind → 「関連」を除く H2 の節 */
function templateSections(): ReadonlyMap<string, readonly string[]> {
  const sections = new Map<string, string[]>();
  for (const file of globSync('ai/**/*.md', { cwd: TEMPLATES_DIR })) {
    const lines = readFileSync(join(TEMPLATES_DIR, file), 'utf8').split(/\r?\n/);
    const meta = parseFrontmatter(lines);
    const kind = meta === null ? undefined : scalar(meta.data, 'kind');
    if (meta === null || kind === undefined || placementOf(kind)?.role !== 'ai') continue;
    const kinds = classifyLines(lines);
    const headings = lines.flatMap((line, index) => {
      const matched = index >= meta.bodyStart && kinds[index] === 'body' ? /^##\s+(.*?)\s*$/.exec(line) : null;
      return matched === null ? [] : [normalizeHeading(matched[1] ?? '')];
    });
    sections.set(kind, headings.filter((heading) => heading !== '関連'));
  }
  return sections;
}

function readAudit(): string {
  const docsDir = join(IGETA_ROOT, 'docs');
  const found = listDocFiles(docsDir).filter((rel) => {
    const meta = parseFrontmatter(readFileSync(join(docsDir, rel), 'utf8').split(/\r?\n/));
    return meta !== null && scalar(meta.data, 'id') === AUDIT_ID;
  });
  assert.equal(found.length, 1, `docs/ に id: ${AUDIT_ID} の文書が 1 本だけあること (見つかった: ${found.join(', ') || 'なし'})`);
  return readFileSync(join(docsDir, found[0] ?? ''), 'utf8');
}

/** 「## <番号>.」で始まる節の中の表の行 (見出し行と区切り行を除く) */
function tableRowsOf(markdown: string, sectionNumber: number): readonly (readonly string[])[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${sectionNumber}\\.\\s`).test(line));
  assert.notEqual(start, -1, `「## ${sectionNumber}.」の節が無い`);
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const rows = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  return rows.slice(2);
}

const sections = templateSections();
const audit = readAudit();
const tableA = tableRowsOf(audit, 2);

describe('雛形の節の監査: 表 A は ai の雛形の全部の節を 1 回ずつ載せている', () => {
  it('ai の雛形は 25 本 (Igeta の手引き 3 本を含む)', () => {
    assert.equal(sections.size, 25);
  });

  it('表 A の行は 4 列で、「全 kind」の関連の行を持つ', () => {
    for (const row of tableA) assert.equal(row.length, 4, row.join(' | '));
    assert.ok(tableA.some((row) => row[0] === '全 kind' && row[1] === '関連'));
  });

  it('kind ごとに、雛形の節 (関連を除く) と表 A の節が一致し (足りない・余る・重複するものが無い)、答えは全部「変わらない」 (「変わる」は 0 件)', () => {
    assert.deepEqual(
      tableA.filter((row) => row[2] !== '変わらない').map((row) => `${row[0]} / ${row[1]}: ${row[2]}`),
      [],
    );
    const audited = new Map<string, string[]>();
    for (const [kind, section] of tableA.filter((row) => row[0] !== '全 kind').map((row) => [row[0] ?? '', row[1] ?? ''] as const)) {
      audited.set(kind, [...(audited.get(kind) ?? []), ...section.split(' ; ').map((name) => name.trim())]);
    }
    assert.deepEqual([...audited.keys()].sort(), [...sections.keys()].sort());
    for (const [kind, expected] of sections) {
      assert.deepEqual([...(audited.get(kind) ?? [])].sort(), [...expected].sort(), `${kind}: 節が一致しない`);
    }
  });
});
