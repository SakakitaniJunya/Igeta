// node --test dist
// 検査の組み立て (手順の順序・判定・検査不能) を FakeRunner で確かめる。npm install も cargo も走らせない。
// 展開と登録は実際に一時 dir へ書く (ネットワーク不要)。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { Report } from '../core/Report.js';
import type { TemplateVariant } from '../generators/TemplateExpandModule.js';
import { CheckTemplatesCommand } from '../cli/commands/CheckTemplatesCommand.js';
import { Cli } from '../cli/Cli.js';
import type { Handler } from './templatesFake.test-support.js';
import { FakeRunner, isVitest, writeVitestResult } from './templatesFake.test-support.js';
import { FIXED_APP, TemplatesCheck } from './TemplatesCheck.js';

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'igeta-tcheck-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const appDirOf = (work: string, variant: TemplateVariant): string =>
  join(work, variant, 'apps', FIXED_APP, variant === 'frontend' ? 'frontend/admin' : 'backend');

/** 全部成功する handler。vitest は 1 件合格の結果を書き、cargo test は合格の行を出し、vite build は dist/app.js を置く */
const allGood: Handler = (call) => {
  if (call.args.some((a) => a.includes('vitest run')) || isVitest(call)) writeVitestResult(call, [{ file: '/w/a.spec.ts', status: 'passed' }]);
  if (call.command === 'npm' && call.args.join(' ') === 'run build' && call.cwd?.endsWith('admin') === true) {
    mkdirSync(join(call.cwd, 'dist'), { recursive: true });
    writeFileSync(join(call.cwd, 'dist', 'app.js'), '');
  }
  if (call.args.some((a) => a.includes('cargo test')) || (call.command === 'cargo' && call.args[0] === 'test') || (call.command === 'docker' && call.args.includes('test'))) {
    return { output: 'test result: ok. 3 passed; 0 failed' };
  }
  return undefined;
};

async function check(
  variants: TemplateVariant[],
  runner: FakeRunner,
  over: { requireEmulator?: boolean; work?: string } = {},
): Promise<{ report: Report; log: string[] }> {
  const log: string[] = [];
  const report = new Report();
  const check = new TemplatesCheck({
    variants,
    requireEmulator: over.requireEmulator ?? false,
    workDir: over.work,
    runner,
    log: (l) => log.push(l),
  });
  report.addAll(await check.run({ targetRoot: tmp(), igetaRoot: IGETA_ROOT }));
  return { report, log };
}

function leftoverMarks(root: string): string[] {
  const bad: string[] = [];
  for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const full = join(e.parentPath, e.name);
    if (/__(?:[a-z][A-Za-z]*|[A-Z][a-z][A-Za-z]*)__/.test(full.slice(root.length)) && !/__tests__/.test(full)) bad.push(full);
    if (/__(?:[a-z][A-Za-z]*|[A-Z][a-z][A-Za-z]*)__/.test(readFileSync(full, 'utf8').replace(/__tests__|__proto__|__dirname/g, ''))) bad.push(full);
  }
  return bad;
}

describe('TemplatesCheck: 全部成功', () => {
  for (const variant of ['hono', 'nestjs', 'rust', 'frontend'] as const) {
    it(`${variant}: 違反 0。展開と登録が実際に書かれ、印の残りが無く、目印は残る`, async () => {
      const work = tmp();
      const runner = new FakeRunner(allGood);
      const { report } = await check([variant], runner, { requireEmulator: variant !== 'frontend', work });
      assert.deepEqual(report.violations, []);
      assert.equal(report.exitCode, ExitCode.Ok);

      const app = appDirOf(work, variant);
      assert.deepEqual(leftoverMarks(app), []);
      assert.ok(!existsSync(join(app, 'src/modules/__context__')) && !existsSync(join(app, 'src/entries/__entry__')));
      const text = (file: string): string => readFileSync(join(app, file), 'utf8');
      if (variant === 'hono') {
        assert.match(text('src/index.ts'), /import \{ createSampleModule \} from '@\/modules\/sample\/index\.js';\n(import .*\n)*\/\/ @igeta:register-import/);
        assert.match(text('src/index.ts'), /app\.route\('\/probe', createProbeRoutes\(\{ verify, sample \}\)\);\n\/\/ @igeta:register-entry/);
        assert.ok(existsSync(join(app, 'src/modules/sample/domain/item.ts')));
      }
      if (variant === 'nestjs') assert.match(text('src/app.module.ts'), / {4}ProbeEntryModule\.register\(\{ verify \}\),\n {4}\/\/ @igeta:register-entry/);
      if (variant === 'rust') {
        assert.match(text('src/entries/mod.rs'), /pub mod probe;\n\/\/ @igeta:register-mod/);
        assert.match(text('src/modules/mod.rs'), /pub mod sample;\n\/\/ @igeta:register-mod/);
        assert.match(text('src/main.rs'), /let sample = backend::modules::sample::create_module\(db\.clone\(\)\);\n {4}\/\/ @igeta:register-module/);
        assert.match(text('src/entries/probe/routes.rs'), /\.route\("\/items", /);
      }
      if (variant === 'frontend') {
        assert.match(text('src/app/routes.ts'), /\{ path: '\/samples', screen: SamplesScreen \},\n {2}\/\/ @igeta:register-route/);
        assert.ok(existsSync(join(app, 'src/features/samples/index.ts')));
      }
    });
  }

  it('手順を順に走らせる (hono): java の有無 → npm ci → tsc → emulator 付き vitest → depcruise → build', async () => {
    const runner = new FakeRunner(allGood);
    await check(['hono'], runner, { requireEmulator: true });
    assert.deepEqual(runner.lines.map((l) => l.split(' ').slice(0, 3).join(' ')), [
      'java -version',
      'npm ci --no-audit',
      'npx tsc -p',
      'npx --no-install firebase',
      'npm run check:deps',
      'npm run build',
    ]);
    assert.equal(runner.calls[3]?.env?.['REQUIRE_EMULATOR'], '1');
  });

  it('成功して作業 dir を指定していなければ一時 dir を消し、指定した dir は残す', async () => {
    const work = tmp();
    await check(['hono'], new FakeRunner(allGood), { work });
    assert.ok(existsSync(join(work, 'hono')));
  });
});

describe('TemplatesCheck: 落ちたとき', () => {
  it('1 手順が非 0 なら、その手順名つきの違反が 1 件 (出力の末尾 20 行を添える)。ほかの手順は走らせ続ける', async () => {
    const output = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`).join('\n');
    const runner = new FakeRunner((call) => (call.args.includes('check:deps') ? { status: 1, output } : allGood(call)));
    const { report } = await check(['hono'], runner);
    assert.equal(report.violations.length, 1);
    const v = report.violations[0];
    assert.equal(v?.severity, 'violation');
    assert.match(v?.message ?? '', /^\[hono\] dependency-cruiser が落ちた \(exit 1\)/);
    assert.match(v?.message ?? '', /line-30/);
    assert.match(v?.message ?? '', /line-11/);
    assert.doesNotMatch(v?.message ?? '', /line-10\b/);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.ok(runner.lines.some((l) => l.startsWith('npm run build')));
  });

  it('npm ci が落ちたらあとの手順は走らせない', async () => {
    const runner = new FakeRunner((call) => (call.command === 'npm' && call.args[0] === 'ci' ? { status: 1, output: 'ERESOLVE' } : undefined));
    const { report } = await check(['nestjs'], runner);
    assert.equal(report.violations.length, 1);
    assert.ok(!runner.lines.some((l) => l.startsWith('npx tsc')));
  });

  it('vitest の失敗・許されない skip・結果ファイルが無い、を違反にする', async () => {
    const skipRunner = new FakeRunner((call) => {
      if (call.args.some((a) => a.includes('vitest run'))) {
        writeVitestResult(call, [
          { file: '/w/a.spec.ts', status: 'passed' },
          { file: '/w/b.spec.ts', status: 'skipped', title: 'どうして' },
          { file: '/w/c.emulator.spec.ts', status: 'skipped', title: 'e' },
        ]);
      }
      return undefined;
    });
    const strict = await check(['hono'], skipRunner, { requireEmulator: true });
    assert.equal(strict.report.violations.length, 2);
    const loose = await check(['hono'], skipRunner, { requireEmulator: false });
    assert.equal(loose.report.violations.length, 1);
    assert.match(loose.report.violations[0]?.message ?? '', /許されない skip.*b\.spec\.ts.*理由不明/);

    const none = await check(['hono'], new FakeRunner(), { requireEmulator: false });
    assert.match(none.report.violations.map((v) => v.message).join('\n'), /vitest の結果.*出ていない/);
  });

  it('frontend は vite build が dist/app.js を出さなければ違反', async () => {
    const { report } = await check(['frontend'], new FakeRunner((call) => (call.command === 'npm' && call.args[0] === 'run' && call.args[1] === 'build' ? undefined : allGood(call))));
    assert.equal(report.violations.length, 1);
    assert.match(report.violations[0]?.message ?? '', /dist\/app\.js を出していない/);
  });
});

describe('TemplatesCheck: 検査不能 (exit 2)', () => {
  it('--require-emulator で Java が無い', async () => {
    const runner = new FakeRunner((call) => (call.command === 'java' ? { status: null, missing: true } : undefined));
    const { report } = await check(['hono'], runner, { requireEmulator: true });
    assert.equal(report.exitCode, ExitCode.CannotCheck);
    assert.match(report.violations[0]?.message ?? '', /Java が無い/);
    assert.deepEqual(runner.lines, ['java -version']);
  });

  it('Java が無くて --require-emulator でなければ、emulator なしで走らせる (emulator の spec の skip だけ許す)', async () => {
    const runner = new FakeRunner((call) => {
      if (call.command === 'java') return { status: 1 };
      if (call.args.some((a) => a.includes('vitest'))) writeVitestResult(call, [{ file: '/w/a.spec.ts', status: 'passed' }, { file: '/w/b.emulator.spec.ts', status: 'skipped' }]);
      return undefined;
    });
    const { report, log } = await check(['nestjs'], runner);
    assert.deepEqual(report.violations, []);
    assert.ok(runner.lines.some((l) => l.startsWith('npx vitest run')));
    assert.ok(log.some((l) => l.includes('emulator なし')));
  });

  it('rust: cargo も Docker も使えなければ検査不能で、手順は 1 つも走らせない', async () => {
    const runner = new FakeRunner((call) => (call.command === 'cargo' || call.command === 'docker' ? { status: null, missing: true } : undefined));
    const { report } = await check(['rust'], runner);
    assert.equal(report.exitCode, ExitCode.CannotCheck);
    assert.match(report.violations[0]?.message ?? '', /cargo も Docker も使えない/);
    assert.ok(runner.calls.every((c) => ['java', 'cargo', 'docker'].includes(c.command)));
  });

  it('rust: cargo があれば直接、無くて docker があれば docker に落ちて firebase.json (0.0.0.0) を置く', async () => {
    const withCargo = new FakeRunner(allGood);
    await check(['rust'], withCargo, { requireEmulator: true });
    assert.ok(withCargo.lines.includes('cargo build --locked'));
    assert.ok(!withCargo.lines.some((l) => l.startsWith('docker')));

    const work = tmp();
    const dockerOnly = new FakeRunner((call) => (call.command === 'cargo' ? { status: null, missing: true } : allGood(call)));
    const { report } = await check(['rust'], dockerOnly, { requireEmulator: true, work });
    assert.deepEqual(report.violations, []);
    assert.ok(dockerOnly.lines.some((l) => l.startsWith('docker cp ')));
    assert.ok(dockerOnly.lines.some((l) => l.includes('rust:1-bookworm cargo build --locked')));
    assert.ok(dockerOnly.lines.at(-1)?.startsWith('docker volume rm'));
    assert.match(readFileSync(join(work, 'rust', 'firebase.json'), 'utf8'), /"host": "0\.0\.0\.0"/);
  });

  it('手順のコマンドが見つからなければ検査不能 (違反にしない)', async () => {
    const runner = new FakeRunner((call) => (call.command === 'npm' ? { status: null, missing: true } : undefined));
    const { report } = await check(['frontend'], runner);
    assert.equal(report.exitCode, ExitCode.CannotCheck);
  });

  it('rust: --require-emulator なのに cargo test が skip を出したら違反', async () => {
    const runner = new FakeRunner((call) =>
      call.args.includes('test') || call.args.some((a) => a.includes('cargo test'))
        ? { output: 'test result: ok. 12 passed; 0 failed\n[skip] x: FIRESTORE_EMULATOR_HOST が無い' }
        : undefined,
    );
    const { report } = await check(['rust'], runner, { requireEmulator: true });
    assert.equal(report.violations.length, 1);
    assert.match(report.violations[0]?.message ?? '', /skip が 1 件/);
    const loose = await check(['rust'], runner, { requireEmulator: false });
    assert.deepEqual(loose.report.violations, []);
  });
});

describe('check-templates の引数', () => {
  const run = async (argv: string[]): Promise<{ code: ExitCode; err: string[] }> => {
    const err: string[] = [];
    const code = await new Cli().register(new CheckTemplatesCommand()).run(['check-templates', ...argv], {
      cwd: tmp(),
      igetaRoot: IGETA_ROOT,
      stdout: () => {},
      stderr: (l) => err.push(l),
    });
    return { code, err };
  };

  it('不明な変種・不明な引数・位置引数は exit 2 (検査を走らせない)', async () => {
    for (const argv of [['--variant', 'django'], ['--variant', 'hono', '--keep'], ['hono'], ['--variant']]) {
      const { code } = await run(argv);
      assert.equal(code, ExitCode.CannotCheck, argv.join(' '));
    }
    assert.match((await run(['--variant', 'django'])).err.join('\n'), /hono\|nestjs\|rust\|frontend/);
  });
});
