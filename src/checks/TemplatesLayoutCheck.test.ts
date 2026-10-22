// node --test dist/checks/TemplatesLayoutCheck.test.js
// templates/ の登録制 (spec 11 の TST-101〜103・301〜305・309)。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import type { TemplatesRegistry } from './TemplatesLayoutCheck.js';
import { TEMPLATES_REGISTRY, TemplatesLayoutCheck } from './TemplatesLayoutCheck.js';

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
  new TemplatesLayoutCheck({ templatesDir, ...(registry === undefined ? {} : { registry }) })
    .run({ targetRoot: templatesDir, igetaRoot: IGETA_ROOT })
    .map((item) => item.message);

after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('TemplatesLayoutCheck (L1〜L3)', () => {
  it('[TST-101〜103] 実物の templates/ は違反 0', () => {
    assert.deepEqual(messagesOf(join(IGETA_ROOT, 'templates')), []);
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
    assert.ok(messages.some((item) => item.includes('templates/backend/go: 登録してあるが check-templates の ALL_VARIANTS に無い')));
  });
});
