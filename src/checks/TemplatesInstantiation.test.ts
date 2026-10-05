// node --test dist/checks/TemplatesInstantiation.test.js
// 雛形の全部を、実際の repo の置き場所に置いたとき (まとまり・年・提出物の名前を替え、id を付けたとき)、
// 新しい構成の検査 (索引・本文リンク・depends_on・置き場所・まとまり・本数) と template-check (必須節・ID・行数・
// 人の文書の型 (PersonFormCheck)・書き込み口) が通ること。
// 雛形の相対リンクの誤り・まとまりのフォルダの下の context の書き忘れ・depends_on の食い違い・人の文書の型の崩れを見つける。
//
// 置かない雛形: Igeta の手引き 3 本 (利用 repo には置かない kind)、ADR (id の番号とファイル名の番号を人が決める。
// ADR の雛形は TemplatesConformance が単体で検査する)。
// 人間レビュー層 (修飾 ID・地図の網羅) は、雛形が記入例の ID を裸で書くので、ここでは見ない。
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, scalar } from '../core/Frontmatter.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { placementOf } from '../core/Role.js';
import { DocGraphCheck } from './DocGraphCheck.js';
import { DocTemplateCheck } from './DocTemplateCheck.js';
import { FolderSizeCheck } from './FolderSizeCheck.js';
import { RoleBoundaryCheck } from './RoleBoundaryCheck.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');
const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** 雛形の名前 (`__name__`) を、実際のファイル名に替える */
const FILE_NAMES: Readonly<Record<string, string>> = {
  '__flow__.md': '01-booking.md',
  '__screen-group__.md': '01-booking.md',
  '__resource__.md': '01-reservations.md',
  '__use-case__.md': '01-create.md',
  '__aggregate__.md': '01-reservation.md',
  '__job__.md': '01-hold-expiry.md',
  '__scenario__.md': '01-outage.md',
  '__chapter__.md': '01-intro.md',
};

function concreteName(dir: string, name: string): string {
  const fixed = FILE_NAMES[name];
  if (fixed !== undefined) return fixed;
  if (name === '__feature__.md') return '01-booking.md';
  if (name !== '__slug__.md') return name;
  if (dir.startsWith('ai/handbook')) return '05-example.md';
  return dir.startsWith('client/proposals') ? '01-proposal.md' : '01-reservation.md';
}

/**
 * 雛形を、実際の repo の docs/ へ置く。id の無記入 (`<kebab-slug>`) は kind 名にする (雛形の depends_on は kind 名で書かれているので、
 * そのまま解決する)。kind を持たない README.md の雛形 (docs/README.md・person/decisions/README.md) も、init が置くので置く。
 */
function instantiate(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-tpl-instantiate-'));
  workspaces.push(root);
  for (const file of globSync('**/*.md', { cwd: TEMPLATES_DIR })) {
    const relPath = file.split('\\').join('/');
    const text = readFileSync(join(TEMPLATES_DIR, relPath), 'utf8');
    const meta = parseFrontmatter(text.split(/\r?\n/));
    const kind = meta === null ? undefined : scalar(meta.data, 'kind');
    const isReadme = basename(relPath) === 'README.md';
    if (!isReadme && (kind === undefined || kind === 'adr' || (placementOf(kind)?.patterns.length ?? 0) === 0)) continue;
    const dir = dirname(relPath).replace('__context__', 'reservation').replace('__year__', '2026').replace('__deliverable__', 'design-document');
    const dest = join(root, 'docs', dir, isReadme ? 'README.md' : concreteName(dir, basename(relPath)));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(
      dest,
      text
        .replace(/^id:\s*<[^>]*>.*$/m, `id: ${kind ?? `${basename(dir === '.' ? 'docs' : dir)}-index`}`)
        .replace(/^created:\s*YYYY-MM-DD/m, 'created: 2026-10-02')
        .replace(/^context:\s*<context>.*$/m, 'context: reservation')
        .replace('[<自分の context-map の id>]', '[context-map]'),
    );
  }
  return root;
}

describe('雛形の全部を実際の置き場所に置いたとき、新しい構成の検査が通る', () => {
  it('索引の生成が不動点になり、本文リンク・depends_on・階層・まとまり・置き場所・本数・template-check (人の文書の型・書き込み口を含む) の違反と警告が 0 件', async () => {
    const root = instantiate();
    assert.ok(globSync('docs/**/*.md', { cwd: root }).length >= 40, '雛形が置けていない');
    const ctx = { targetRoot: root, igetaRoot: IGETA_ROOT };
    for (let pass = 1; pass <= 2; pass += 1) {
      const graph = new DocGraphCheck({ write: true });
      assert.deepEqual(await graph.run(ctx), [], `docs-graph --write (${pass} 回目)`);
    }
    const check = new DocGraphCheck({});
    assert.deepEqual(await check.run(ctx), [], 'docs-graph の検査 (索引の鮮度・リンク・参照・階層)');
    assert.deepEqual(check.warnings, [], 'docs-graph の警告 (未解決の参照など)');
    assert.deepEqual(new RoleBoundaryCheck().run(ctx), [], '置き場所・まとまりの境界');
    assert.deepEqual(new FolderSizeCheck().run(ctx), [], '1 フォルダの本数');
    const templateCheck = new DocTemplateCheck({ requireKind: true });
    assert.deepEqual(templateCheck.run(ctx), [], 'template-check (必須節・ID・行数・人の文書の型・書き込み口)');
    assert.deepEqual(templateCheck.warnings, [], 'template-check の警告 (まとまりの合計字数)');
  });
});

