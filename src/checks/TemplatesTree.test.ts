// node --test dist/checks/TemplatesTree.test.js
// 雛形の木が、要件定義書 02 §7 の置き場所 (src/core/Role.ts) と一致していること (ADR-0005 決定 4・ADR-0009)。
// 雛形は docs/ と同じ木に置く。まとまりのフォルダは __context__、年は __year__、提出物は __deliverable__。
import { globSync, readFileSync } from 'node:fs';
import { posix, join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_DOCS_PER_FOLDER } from './FolderSizeCheck.js';
import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import { classifyLines } from '../core/LineClassifier.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { matchPlacement, placementOf, ROLE_OF_KIND, roleOfPath } from '../core/Role.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');

/** 雛形を持たない kind (要件定義書 02 §7。ADR-0010 の「雛形なし」) */
const KINDS_WITHOUT_TEMPLATE: ReadonlySet<string> = new Set(['secrets-management', 'external-integration']);

/** 利用 repo には置かない kind (Igeta の手引き 3 本)。雛形は ai/handbook/how-to/ に置く */
const PINNED_GUIDE_KINDS: ReadonlySet<string> = new Set(['document-taxonomy', 'human-review', 'provenance-workflow']);

interface Template {
  /** templates/docs/ からの相対パス (区切りは `/`) */
  readonly relPath: string;
  readonly kind: string;
  /** frontmatter の depends_on・relates_to (雛形の id は kind 名) */
  readonly dependsOn: readonly string[];
  readonly relatesTo: readonly string[];
  readonly lines: readonly string[];
}

/** kind を持つ雛形 (.md) の全部 */
function listTemplates(): readonly Template[] {
  const found: Template[] = [];
  for (const file of globSync('**/*.md', { cwd: TEMPLATES_DIR })) {
    const relPath = file.split('\\').join('/');
    const lines = readFileSync(join(TEMPLATES_DIR, file), 'utf8').split(/\r?\n/);
    const meta = parseFrontmatter(lines);
    const kind = meta === null ? undefined : scalar(meta.data, 'kind');
    if (meta !== null && kind !== undefined && kind !== '') {
      found.push({ relPath, kind, dependsOn: stringList(meta.data, 'depends_on'), relatesTo: stringList(meta.data, 'relates_to'), lines });
    }
  }
  return found.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

const templates = listTemplates();

describe('雛形の木: 要件定義書 02 §7 の置き場所と一致する', () => {
  it('雛形を持つ kind は 45 (47 kind から、雛形なしの 2 kind を除く) で、kind ごとに 1 枚', () => {
    const kinds = templates.map((template) => template.kind);
    assert.equal(new Set(kinds).size, kinds.length, '同じ kind の雛形が 2 枚ある');
    const expected = [...ROLE_OF_KIND.keys()].filter((kind) => !KINDS_WITHOUT_TEMPLATE.has(kind));
    assert.equal(expected.length, 45);
    assert.deepEqual([...kinds].sort(), expected.sort());
  });

  it('雛形は、自分の kind の置き場所のパターンに当たるパスにある (まとまりは __context__ が当たる。年は西暦 4 桁に替えて当てる)', () => {
    for (const { relPath, kind } of templates) {
      const placement = placementOf(kind);
      assert.ok(placement !== undefined, `${relPath}: 置き場所の表に無い kind: ${kind}`);
      if (PINNED_GUIDE_KINDS.has(kind)) continue;
      const concrete = relPath.replace('__year__', '2026');
      assert.ok(matchPlacement(kind, concrete).ok, `${relPath}: kind ${kind} の置き場所ではない (${placement.patterns.join(' / ')})`);
    }
  });

  it('Igeta の手引き 3 本の雛形は ai/handbook/how-to/ にあり、利用 repo には置かない kind (置き場所のパターンが空)', () => {
    const guides = templates.filter((template) => PINNED_GUIDE_KINDS.has(template.kind));
    assert.deepEqual(
      guides.map((template) => template.relPath).sort(),
      [
        'ai/handbook/how-to/01-document-taxonomy.md',
        'ai/handbook/how-to/03-human-review.md',
        'ai/handbook/how-to/04-provenance-workflow.md',
      ],
    );
    for (const { kind } of guides) assert.equal(placementOf(kind)?.patterns.length, 0, kind);
  });

  it('雛形置き場の第 1 階層は person・ai・client と、docs/README.md の雛形だけ', () => {
    const top = new Set(globSync('**/*', { cwd: TEMPLATES_DIR }).map((file) => file.split('\\').join('/').split('/')[0]));
    assert.deepEqual([...top].sort(), ['README.md', 'ai', 'client', 'person']);
    for (const { relPath } of templates) assert.notEqual(roleOfPath(relPath), null, `${relPath}: person・ai・client の下にない`);
  });

  it('1 フォルダの雛形は 15 本まで (利用 repo の 1 フォルダの上限と同じ)', () => {
    const counts = new Map<string, number>();
    for (const file of globSync('**/*.md', { cwd: TEMPLATES_DIR })) {
      const dir = posix.dirname(file.split('\\').join('/'));
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    for (const [dir, count] of counts) assert.ok(count <= MAX_DOCS_PER_FOLDER, `${dir}: ${count} 本`);
  });
});

/** ai/ の文書の見出しに置かない語 (ADR-0002 条件 11・ADR-0010 決定 4。RoleBoundaryCheck と同じ) */
const UNDECIDED_HEADING_RE = /未決|未確定|保留|要確認|宿題|(?<![A-Za-z])(?:tbd|todo)s?(?![A-Za-z])/i;

describe('ai の雛形: 人の決めに従う (ADR-0002 条件 3・4・11、ADR-0010 決定 3・4)', () => {
  const aiTemplates = templates.filter((template) => placementOf(template.kind)?.role === 'ai' && !PINNED_GUIDE_KINDS.has(template.kind));

  it('ai の雛形は 22 本 (Igeta の手引き 3 本を除く)', () => {
    assert.equal(aiTemplates.length, 22);
  });

  it('見出しに「未決」「未確定」などの語の節が無い (人の決めが要るものは person の「決めてほしいこと」へ)', () => {
    for (const template of aiTemplates) {
      const kinds = classifyLines(template.lines);
      template.lines.forEach((line, index) => {
        const heading = kinds[index] === 'body' ? /^\s{0,3}#{1,6}\s+(.*?)\s*$/.exec(line)?.[1] : undefined;
        assert.ok(heading === undefined || !UNDECIDED_HEADING_RE.test(heading), `${template.relPath}:${index + 1} 未決の節がある: ${heading}`);
      });
    }
  });

  it('depends_on・relates_to は person か ai の kind だけを指す (ai は client を指さない)', () => {
    for (const template of aiTemplates) {
      for (const id of [...template.dependsOn, ...template.relatesTo]) {
        const role = ROLE_OF_KIND.get(id)?.role;
        assert.ok(role === undefined || role === 'person' || role === 'ai', `${template.relPath}: ${role} の kind (${id}) を指している`);
      }
    }
  });

  it('ai/specs/ の雛形は、depends_on を辿ると person の kind に届く (まとまりの地図の id は person)', () => {
    const dependsOnOf = new Map(templates.map((template) => [template.kind, template.dependsOn] as const));
    const reachesPerson = (kind: string, seen: ReadonlySet<string> = new Set()): boolean => {
      if (ROLE_OF_KIND.get(kind)?.role === 'person') return true;
      if (seen.has(kind)) return false;
      return (dependsOnOf.get(kind) ?? []).some((id) => id.startsWith('<') || reachesPerson(id, new Set([...seen, kind])));
    };
    for (const template of aiTemplates.filter((candidate) => candidate.relPath.startsWith('ai/specs/'))) {
      assert.ok(reachesPerson(template.kind), `${template.relPath}: depends_on を辿っても person に届かない`);
    }
  });
});

