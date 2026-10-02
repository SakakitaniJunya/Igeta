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
import type { Role } from '../core/Role.js';
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

/** 確定させる人ごとに、指してよい相手 (ADR-0002 条件 3: 依存は上流へ。person は person だけ、ai は person と ai、client は全部) */
const MAY_POINT_TO: Readonly<Record<Role, readonly Role[]>> = {
  person: ['person'],
  ai: ['person', 'ai'],
  client: ['person', 'ai', 'client'],
};

describe('雛形の参照: 依存は上流へ (ADR-0002 条件 3・4)', () => {
  it('depends_on・relates_to (雛形の id は kind 名) と本文の相対リンクは、確定させる人ごとに指してよい相手だけを指す', () => {
    const wrong: string[] = [];
    for (const template of templates) {
      const role = roleOfPath(template.relPath);
      if (role === null) continue;
      for (const id of [...template.dependsOn, ...template.relatesTo]) {
        const target = ROLE_OF_KIND.get(id)?.role;
        if (target !== undefined && !MAY_POINT_TO[role].includes(target)) wrong.push(`${template.relPath}: ${role} が ${target} の kind (${id}) を指している`);
      }
      const kinds = classifyLines(template.lines);
      template.lines.forEach((line, index) => {
        if (kinds[index] !== 'body') return;
        for (const link of line.matchAll(/\]\(([^)\s#]+)[^)]*\)/g)) {
          const href = link[1] ?? '';
          if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
          const target = roleOfPath(posix.normalize(posix.join(posix.dirname(template.relPath), href)));
          if (target !== null && !MAY_POINT_TO[role].includes(target)) wrong.push(`${template.relPath}:${index + 1} ${role} が ${target} へリンクしている: ${href}`);
        }
      });
    }
    assert.deepEqual(wrong, []);
  });

  it('ai/specs/ の雛形は、depends_on を辿ると person の kind に届く (まとまりの地図の id は person)', () => {
    const aiSpecs = templates.filter((template) => template.relPath.startsWith('ai/specs/'));
    assert.ok(aiSpecs.length > 0, 'ai/specs/ の雛形が見つからない');
    const dependsOnOf = new Map(templates.map((template) => [template.kind, template.dependsOn] as const));
    const reachesPerson = (kind: string, seen: ReadonlySet<string> = new Set()): boolean => {
      if (ROLE_OF_KIND.get(kind)?.role === 'person') return true;
      if (seen.has(kind)) return false;
      return (dependsOnOf.get(kind) ?? []).some((id) => id.startsWith('<') || reachesPerson(id, new Set([...seen, kind])));
    };
    assert.deepEqual(
      aiSpecs.filter((template) => !reachesPerson(template.kind)).map((template) => template.relPath),
      [],
    );
  });
});
