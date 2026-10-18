import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../../core/ExitCode.js';
import { IGETA_ROOT } from '../../core/Paths.js';
import { ArgParseError } from '../Args.js';
import { Cli } from '../Cli.js';
import { ExpandCommand } from './ExpandCommand.js';

const dirs: string[] = [];
const newRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-expand-cmd-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function run(argv: string[], cwd: string): Promise<{ code: ExitCode; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const cli = new Cli().register(new ExpandCommand());
  return cli
    .run(['expand', ...argv], { cwd, igetaRoot: IGETA_ROOT, stdout: (l) => out.push(l), stderr: (l) => err.push(l) })
    .then((code) => ({ code, out, err }));
}

const fileCount = (root: string): number => (existsSync(root) ? readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0);
const MODULE = join(IGETA_ROOT, 'templates/backend/hono/src/modules/__context__');
const ENTRY = join(IGETA_ROOT, 'templates/backend/hono/src/entries/__entry__');
const FEATURE = join(IGETA_ROOT, 'templates/frontend/admin/src/features/__feature__');

describe('ExpandCommand', () => {
  it('展開して exit 0。WRITE と、足す行の NEXT を出す', async () => {
    const root = newRoot();
    const { code, out } = await run([MODULE, '--app', 'shop', '--context', 'stock-item', '--aggregate', 'location', '--root', root], process.cwd());
    assert.equal(code, ExitCode.Ok);
    assert.ok(out.some((l) => l === 'WRITE apps/shop/backend/src/modules/stock-item/index.ts'));
    assert.ok(out.some((l) => l.startsWith('NEXT') && l.includes('@igeta:register-module')));
    assert.ok(out.some((l) => l.includes('const stockItem = createStockItemModule(db);')));
    assert.ok(fileCount(root) > 20);
  });

  it('entry の NEXT は verify を自分で作ることを案内する', async () => {
    const { out } = await run([ENTRY, '--app', 'shop', '--context', 'stock-item', '--aggregate', 'location', '--entry', 'admin', '--root', newRoot()], process.cwd());
    assert.ok(out.some((l) => l.includes("app.route('/admin', createAdminRoutes({ verify, stockItem }));")));
    assert.ok(out.some((l) => l.includes('verify') && l.includes('このアプリで作って渡す')));
  });

  it('--dry-run は DRY の一覧だけで何も書かない', async () => {
    const root = newRoot();
    const { code, out } = await run([FEATURE, '--app', 'shop', '--feature', 'locations', '--root', root, '--dry-run'], process.cwd());
    assert.equal(code, ExitCode.Ok);
    assert.ok(out.length > 10 && out.every((l) => l.startsWith('DRY ')));
    assert.equal(fileCount(root), 0);
  });

  it('cwd からの相対 path を解決し、--root の既定は cwd', async () => {
    const root = newRoot();
    const { code } = await run(['templates/frontend/admin/src/features/__feature__', '--app', 'shop', '--feature', 'locations', '--root', root], IGETA_ROOT);
    assert.equal(code, ExitCode.Ok);
    assert.ok(existsSync(join(root, 'apps/shop/frontend/admin/src/features/locations/index.ts')));
    const inCwd = newRoot();
    assert.equal((await run([FEATURE, '--app', 'shop', '--feature', 'locations'], inCwd)).code, ExitCode.Ok);
    assert.ok(existsSync(join(inCwd, 'apps/shop/frontend/admin/src/features/locations/index.ts')));
  });

  it('2 回目は exit 1 で、1 ファイルも増えない', async () => {
    const root = newRoot();
    const argv = [FEATURE, '--app', 'shop', '--feature', 'locations', '--root', root];
    assert.equal((await run(argv, process.cwd())).code, ExitCode.Ok);
    const before = fileCount(root);
    const second = await run(argv, process.cwd());
    assert.equal(second.code, ExitCode.Violation);
    assert.ok(second.err.join('\n').includes('既存'));
    assert.equal(fileCount(root), before);
  });

  it('印の無い path は exit 1', async () => {
    const root = newRoot();
    const { code } = await run([join(IGETA_ROOT, 'templates/backend/hono/src/index.ts'), '--app', 'a', '--root', root], process.cwd());
    assert.equal(code, ExitCode.Violation);
    assert.equal(fileCount(root), 0);
  });

  it('引数不足・ケバブでない名前・不明な引数は exit 2 で何も書かない', async () => {
    const root = newRoot();
    for (const argv of [
      [MODULE, '--app', 'a', '--context', 'c', '--root', root],
      [MODULE, '--context', 'c', '--aggregate', 'x', '--root', root],
      [MODULE, '--app', 'a', '--context', 'StockItem', '--aggregate', 'x', '--root', root],
      [MODULE, '--app', 'A', '--context', 'c', '--aggregate', 'x', '--root', root],
      [MODULE, '--app', 'a', '--context', 'c', '--aggregate', 'x', '--out', 'y', '--root', root],
      ['--app', 'a', '--root', root],
      [MODULE, FEATURE, '--app', 'a', '--context', 'c', '--aggregate', 'x', '--root', root],
    ]) {
      const { code } = await run(argv, process.cwd());
      assert.equal(code, ExitCode.CannotCheck, argv.join(' '));
    }
    assert.equal(fileCount(root), 0);
    await assert.rejects(new ExpandCommand().run([MODULE, '--app', 'a', '--root', root], { cwd: root, igetaRoot: IGETA_ROOT, stdout: () => {}, stderr: () => {} }), ArgParseError);
  });
});
