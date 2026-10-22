// node --test dist/checks/TemplatesLayoutCheck.test.js
// templates/ の登録制 (spec 11 の TST-101〜103・301〜305・309)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { TemplatesLayoutCheck } from './TemplatesLayoutCheck.js';
import type { TemplatesRegistry } from './TemplatesRegistry.js';
import { TEMPLATES_REGISTRY } from './TemplatesRegistry.js';

const roots: string[] = [];

function makeTemplates(paths: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-tpl-layout-'));
  roots.push(root);
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), '');
  }
  return root;
}

const VALID = [
  '.github/p.md', 'README.md', 'docs/a.md', 'backend/README.md', 'backend/hono/a', 'backend/nestjs/a', 'backend/rust/a',
  'frontend/admin/a', 'mobile/ios/a',
];

const messagesOf = (templatesDir: string, registry?: TemplatesRegistry): string[] =>
  new TemplatesLayoutCheck({ templatesDir, isInnerChecked: false, ...(registry === undefined ? {} : { registry }) })
    .run({ targetRoot: templatesDir, igetaRoot: IGETA_ROOT })
    .map((item) => item.message);

after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('TemplatesLayoutCheck (L1〜L3)', () => {
  it('[TST-101〜104] 実物の templates/ は、登録も雛形の中 (変種ごとの check-layout) も違反 0', () => {
    const real = new TemplatesLayoutCheck().run({ targetRoot: IGETA_ROOT, igetaRoot: IGETA_ROOT });
    assert.deepEqual(real, []);
  });

  it('[TST-301][TST-309] 登録外の名前 (android-app・legacy-api) は落ちる', () => {
    const messages = messagesOf(makeTemplates([...VALID, 'android-app/a', 'legacy-api/a']));
    assert.equal(messages.filter((item) => item.includes('登録外')).length, 2);
  });

  it('[TST-302] 退役した api-module を戻すと落ちる', () => {
    assert.ok(messagesOf(makeTemplates([...VALID, 'api-module/a'])).some((item) => item.includes('templates/api-module: 登録外')));
  });

  it('[TST-303] 登録が 9 個になると上限で落ちる', () => {
    const root = { ...TEMPLATES_REGISTRY.root, a: undefined, b: undefined, c: undefined };
    const messages = messagesOf(makeTemplates(VALID), { ...TEMPLATES_REGISTRY, root });
    assert.ok(messages.some((item) => item.includes('上限 8')));
  });

  it('[TST-304] 登録だけ足して実体が無いと落ちる', () => {
    const root = { ...TEMPLATES_REGISTRY.root, mobile: ['ios', 'android'] };
    const messages = messagesOf(makeTemplates(VALID), { ...TEMPLATES_REGISTRY, root });
    assert.ok(messages.some((item) => item.includes('templates/mobile/android: 登録してあるが実体が無い')));
  });

  it('[TST-102] 第 2 階層の登録外は落ちる', () => {
    assert.ok(messagesOf(makeTemplates([...VALID, 'backend/go/a'])).some((item) => item.includes('templates/backend/go: 登録外')));
  });

  it('[TST-305] backend/go を登録して実体も置いても、ALL_VARIANTS に無ければ落ちる', () => {
    const root = { ...TEMPLATES_REGISTRY.root, backend: ['hono', 'nestjs', 'rust', 'go'] };
    const messages = messagesOf(makeTemplates([...VALID, 'backend/go/a']), { ...TEMPLATES_REGISTRY, root });
    assert.ok(messages.some((item) => item.includes('templates/backend/go: check-templates の変種にも除外にも登録が無い')));
  });

  it('[L3] mobile/android を登録して実体を置いても、除外の理由が無ければ落ちる (exempt は mobile にも効く)', () => {
    const root = { ...TEMPLATES_REGISTRY.root, mobile: ['ios', 'android'] };
    const messages = messagesOf(makeTemplates([...VALID, 'mobile/android/a']), { ...TEMPLATES_REGISTRY, root });
    assert.ok(messages.some((item) => item.includes('templates/mobile/android: check-templates の変種にも除外にも登録が無い')));
  });

  it('[L3] 除外に理由を書けば mobile/android は通り、置き場の無い除外は落ちる', () => {
    const root = { ...TEMPLATES_REGISTRY.root, mobile: ['ios', 'android'] };
    const exempt = { ...TEMPLATES_REGISTRY.exempt, 'mobile/android': '自己検査が無い' };
    assert.deepEqual(messagesOf(makeTemplates([...VALID, 'mobile/android/a']), { ...TEMPLATES_REGISTRY, root, exempt }), []);
    const stale = { ...TEMPLATES_REGISTRY.exempt, 'mobile/windows': 'x' };
    assert.ok(messagesOf(makeTemplates(VALID), { ...TEMPLATES_REGISTRY, exempt: stale }).some((item) => item.includes('mobile/windows: 除外に書いてある')));
  });

  it('[L3] matrix の変種が登録に無いと、変種名つきで落ちる', () => {
    const variants = TEMPLATES_REGISTRY.variants.filter((item) => item.variant !== 'rust');
    const messages = messagesOf(makeTemplates(VALID), { ...TEMPLATES_REGISTRY, variants });
    assert.ok(messages.some((item) => item.includes('check-templates の変種 rust が templates/ の登録に無い')));
  });

  it('[L2] 第 2 階層のファイル (legacy.tgz) は落ち、README.md と OS の残骸は落ちない', () => {
    const messages = messagesOf(makeTemplates([...VALID, 'backend/legacy.tgz', 'backend/.DS_Store', 'backend/._x', 'Thumbs.db']));
    assert.deepEqual(messages, ['templates/backend/legacy.tgz: 登録外']);
  });

  it('[L4] 雛形の中の違反は変種名つきで全変種ぶん 1 回で出る', () => {
    const body = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const files = ['hono', 'nestjs'].flatMap((name) => body.map((file) => `backend/${name}/src/${file}.ts`));
    const registry: TemplatesRegistry = {
      root: { backend: ['hono', 'nestjs'] },
      variants: [
        { variant: 'hono', folder: 'backend/hono', extensions: [] },
        { variant: 'nestjs', folder: 'backend/nestjs', extensions: [] },
      ],
      exempt: {},
    };
    const dir = makeTemplates(files);
    const messages = new TemplatesLayoutCheck({ templatesDir: dir, registry }).run({ targetRoot: dir, igetaRoot: IGETA_ROOT }).map((item) => item.message);
    assert.equal(messages.filter((item) => item.startsWith('[hono]') && item.includes('本体が 8 本')).length, 1);
    assert.equal(messages.filter((item) => item.startsWith('[nestjs]') && item.includes('本体が 8 本')).length, 1);
  });
});
