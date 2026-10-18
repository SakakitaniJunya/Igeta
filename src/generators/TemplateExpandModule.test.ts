// node --test dist
// 実 templates/ と、特殊な場合を作る最小の雛形の両方で、展開の規則 (置き場・置換・書く前の検査) を確かめる。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { buildReplacements, TemplateExpandModule } from './TemplateExpandModule.js';

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-expand-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const tpl = (...parts: string[]): string => join(IGETA_ROOT, 'templates', ...parts);

function listAll(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/** 最小の雛形を書く。files は side の根からの相対 path → 中身 */
function writeTemplates(base: string, layout: string, files: Record<string, string | Buffer>): void {
  for (const [rel, body] of Object.entries(files)) {
    const full = join(base, 'templates', layout, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}

const NAMES = { context: 'stock-item', aggregate: 'location', entry: 'admin', feature: 'locations' };

describe('TemplateExpandModule: 実 templates', () => {
  it('hono の module は変種の段を落として apps/<app>/backend/ の鏡へ展開し、印が残らない', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const plan = expand.prepare({ templatePath: tpl('backend', 'hono', 'src', 'modules', '__context__'), app: 'shop', names: NAMES });
    assert.deepEqual(plan.violations, []);
    assert.equal(plan.variant, 'hono');
    assert.equal(plan.unit, 'module');
    expand.execute(plan);
    const written = listAll(root);
    assert.ok(written.length > 20);
    for (const file of written) {
      assert.ok(file.includes(join(root, 'apps', 'shop', 'backend', 'src', 'modules', 'stock-item')), file);
      assert.doesNotMatch(file.slice(root.length), /__|hono/);
      assert.doesNotMatch(readFileSync(file, 'utf8'), /__[A-Za-z]+__/, file);
    }
    const index = readFileSync(join(root, 'apps/shop/backend/src/modules/stock-item/index.ts'), 'utf8');
    assert.match(index, /export function createStockItemModule\(/);
    assert.match(index, /interface StockItemModule/);
  });

  it('frontend の feature は apps/<app>/frontend/admin/ の鏡へ展開する', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const plan = expand.prepare({ templatePath: tpl('frontend', 'admin', 'src', 'features', '__feature__'), app: 'shop', names: NAMES });
    assert.deepEqual(plan.violations, []);
    assert.equal(plan.variant, 'frontend');
    expand.execute(plan);
    assert.ok(existsSync(join(root, 'apps/shop/frontend/admin/src/features/locations/index.ts')));
    assert.ok(existsSync(join(root, 'apps/shop/frontend/admin/src/features/locations/presentation/screen/LocationsScreen.tsx')));
  });

  it('rust は全ての印をスネークにするが、URL と collection の __aggregatesPath__ はケバブのまま', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const names = { ...NAMES, aggregate: 'stock-item', aggregates: 'stock-items', context: 'order-line' };
    for (const unit of ['modules/__context__', 'entries/__entry__']) {
      const plan = expand.prepare({ templatePath: tpl('backend', 'rust', 'src', ...unit.split('/')), app: 'shop', names });
      assert.deepEqual(plan.violations, [], unit);
      expand.execute(plan);
    }
    const base = join(root, 'apps/shop/backend/src');
    assert.ok(existsSync(join(base, 'modules/order_line/domain/stock_item.rs')));
    const routes = readFileSync(join(base, 'entries/admin/routes.rs'), 'utf8');
    assert.match(routes, /\.route\("\/stock-items", /);
    assert.match(routes, /list_stock_items/);
    assert.match(routes, /OrderLineModule/);
    assert.match(readFileSync(join(base, 'modules/order_line/infrastructure/firestore_tx.rs'), 'utf8'), /COLLECTION: &str = "stock-items"/);
    for (const file of listAll(root)) assert.doesNotMatch(readFileSync(file, 'utf8'), /__[A-Za-z]+__/, file);
  });

  it('hono の entry は entry・context・aggregate の 3 つを要求する', () => {
    const expand = new TemplateExpandModule({ targetRoot: tmp(), igetaRoot: IGETA_ROOT });
    const plan = expand.prepare({ templatePath: tpl('backend', 'hono', 'src', 'entries', '__entry__'), app: 'shop', names: {} });
    assert.deepEqual(plan.missingNames, ['context', 'aggregate', 'entry']);
    assert.equal(plan.entries.length, 0);
  });

  it('module は context と aggregate、feature は feature だけを要求し、要らない名前は無視する', () => {
    const expand = new TemplateExpandModule({ targetRoot: tmp(), igetaRoot: IGETA_ROOT });
    const mod = expand.prepare({ templatePath: tpl('backend', 'nestjs', 'src', 'modules', '__context__'), app: 'a', names: { entry: 'x' } });
    assert.deepEqual(mod.missingNames, ['context', 'aggregate']);
    const feature = expand.prepare({ templatePath: tpl('frontend', 'admin', 'src', 'features', '__feature__'), app: 'a', names: { feature: 'x', context: 'y' } });
    assert.deepEqual(feature.missingNames, []);
    assert.deepEqual(feature.violations, []);
  });

  it('土台のファイル・印の無いフォルダ・templates の外・scaffold 用の雛形は違反 (書かない)', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    for (const path of [
      tpl('backend', 'hono', 'src', 'index.ts'),
      tpl('backend', 'hono', 'src', 'shared'),
      tpl('backend', 'hono', 'src', 'modules'),
      tpl('backend', 'hono', 'src', 'modules', '__context__', 'domain'),
      tpl('backend', 'hono'),
      tpl('backend', 'unknown', 'src', 'modules', '__context__'),
      tpl('api-shared-kernel'),
      tpl('frontend', 'admin', 'src', 'app'),
      join(root, 'elsewhere'),
    ]) {
      const plan = expand.prepare({ templatePath: path, app: 'a', names: NAMES });
      assert.equal(plan.violations.length, 1, path);
      assert.equal(plan.violations[0]?.severity, 'violation');
      assert.equal(plan.entries.length, 0, path);
    }
    assert.deepEqual(listAll(root), []);
  });

  it('2 回目は展開先に既存があるので全件違反で、1 ファイルも増えない', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const request = { templatePath: tpl('frontend', 'admin', 'src', 'features', '__feature__'), app: 'a', names: NAMES };
    const first = expand.prepare(request);
    expand.execute(first);
    const before = listAll(root).length;
    const second = expand.prepare(request);
    assert.equal(second.violations.length, first.entries.length);
    assert.ok(second.violations.every((v) => v.message.includes('既存')));
    assert.throws(() => expand.execute(second));
    assert.equal(listAll(root).length, before);
  });
});

describe('TemplateExpandModule: 最小の雛形', () => {
  const setup = (files: Record<string, string | Buffer>, layout = 'backend/hono/src/modules/__context__'): { root: string; igeta: string; expand: TemplateExpandModule; path: string } => {
    const igeta = tmp();
    const root = tmp();
    writeTemplates(igeta, layout, files);
    return { root, igeta, expand: new TemplateExpandModule({ targetRoot: root, igetaRoot: igeta }), path: join(igeta, 'templates', layout) };
  };

  it('置換後に同じ名前になるファイルは違反', () => {
    const { expand, path } = setup({ '__aggregate__.ts': 'a', 'item.ts': 'b' });
    const plan = expand.prepare({ templatePath: path, app: 'a', names: { context: 'c', aggregate: 'item' } });
    assert.equal(plan.violations.length, 1);
    assert.match(plan.violations[0]?.message ?? '', /同じ名前/);
  });

  it('置換されない印は名前・中身ごとに全部出す。__tests__ のような慣用名や全大文字は印でない', () => {
    const { expand, path } = setup({
      '__aggregate__.ts': '__aggregate__ __bogus__ __tests__ __ADMIN_ROUTES__ __dirname',
      '__oops__.ts': 'x',
    });
    const plan = expand.prepare({ templatePath: path, app: 'a', names: { context: 'c', aggregate: 'item' } });
    const messages = plan.violations.map((v) => v.message).join('\n');
    assert.equal(plan.violations.length, 2);
    assert.match(messages, /__bogus__/);
    assert.match(messages, /__oops__/);
    assert.doesNotMatch(messages, /__tests__|__ADMIN_ROUTES__|__dirname/);
  });

  it('バイナリ (NUL を含む) は置換しない', () => {
    const binary = Buffer.from([0x5f, 0x5f, 0x61, 0x67, 0x67, 0x72, 0x65, 0x67, 0x61, 0x74, 0x65, 0x5f, 0x5f, 0x00, 0x01]);
    const { root, expand, path } = setup({ '__aggregate__.bin': binary });
    const plan = expand.prepare({ templatePath: path, app: 'a', names: { context: 'c', aggregate: 'item' } });
    assert.deepEqual(plan.violations, []);
    expand.execute(plan);
    assert.deepEqual(readFileSync(join(root, 'apps/a/backend/src/modules/c/item.bin')), binary);
  });

  it('空の雛形は違反', () => {
    const { expand, path } = setup({});
    mkdirSync(path, { recursive: true });
    assert.match(expand.prepare({ templatePath: path, app: 'a', names: { context: 'c' } }).violations[0]?.message ?? '', /空/);
  });

  it('利用 repo の雛形 (templates/backend/src/…、変種の段なし) も同じ式で写す', () => {
    const root = tmp();
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: tmp() });
    writeTemplates(root, 'backend/src/modules/__context__', { 'index.ts': 'export const __contextVar__ = 1;' });
    const plan = expand.prepare({ templatePath: join(root, 'templates/backend/src/modules/__context__'), app: 'a', names: { context: 'stock-item' } });
    assert.deepEqual(plan.violations, []);
    assert.equal(plan.variant, undefined);
    expand.execute(plan);
    assert.equal(readFileSync(join(root, 'apps/a/backend/src/modules/stock-item/index.ts'), 'utf8'), 'export const stockItem = 1;');
  });

  it('複数形の既定は s を付け、--aggregates で上書きできる', () => {
    const { expand, path } = setup({ 'list-__aggregates__.ts': '__aggregates__' });
    assert.equal(expand.prepare({ templatePath: path, app: 'a', names: { context: 'c', aggregate: 'city' } }).entries[0]?.rel, 'apps/a/backend/src/modules/c/list-citys.ts');
    assert.equal(expand.prepare({ templatePath: path, app: 'a', names: { context: 'c', aggregate: 'city', aggregates: 'cities' } }).entries[0]?.rel, 'apps/a/backend/src/modules/c/list-cities.ts');
  });
});

describe('TemplateExpandModule: 追加の検査', () => {
  it('親フォルダ名が印の形 (__work__) でも、展開先の印の残りと誤検出しない', () => {
    const base = tmp();
    const root = join(base, '__work__', 'app');
    mkdirSync(root, { recursive: true });
    const expand = new TemplateExpandModule({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const plan = expand.prepare({ templatePath: tpl('frontend', 'admin', 'src', 'features', '__feature__'), app: 'a', names: NAMES });
    assert.deepEqual(plan.violations, []);
    expand.execute(plan);
    assert.ok(existsSync(join(root, 'apps/a/frontend/admin/src/features/locations/index.ts')));
  });

  it('Object.prototype のキー (__defineGetter__ など) は名前の要求にならず、残った印として報告される', () => {
    const igeta = tmp();
    writeTemplates(igeta, 'backend/hono/src/modules/__context__', { 'a.ts': '__defineGetter__ __context__ __constructor__' });
    const expand = new TemplateExpandModule({ targetRoot: tmp(), igetaRoot: igeta });
    const path = join(igeta, 'templates/backend/hono/src/modules/__context__');
    const plan = expand.prepare({ templatePath: path, app: 'a', names: { context: 'c' } });
    assert.deepEqual(plan.missingNames, []);
    assert.equal(plan.violations.length, 2);
    assert.match(plan.violations.map((v) => v.message).join('\n'), /__defineGetter__[\s\S]*__constructor__|__constructor__[\s\S]*__defineGetter__/);
  });
});

describe('buildReplacements', () => {
  it('スネークの変種は __aggregatesPath__ だけケバブ、パスカルとキャメルは同じ', () => {
    const table = buildReplacements({ context: 'stock-item', aggregate: 'order-line' }, true);
    assert.equal(table.get('__context__'), 'stock_item');
    assert.equal(table.get('__Context__'), 'StockItem');
    assert.equal(table.get('__contextVar__'), 'stockItem');
    assert.equal(table.get('__aggregates__'), 'order_lines');
    assert.equal(table.get('__aggregatesPath__'), 'order-lines');
    const plain = buildReplacements({ context: 'stock-item', aggregate: 'order-line' }, false);
    assert.equal(plain.get('__aggregates__'), 'order-lines');
    assert.equal(plain.get('__aggregatesPath__'), 'order-lines');
  });
});
