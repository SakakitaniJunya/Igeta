import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import type { ExpandNames, TemplateVariant, UnitKind } from '../generators/TemplateExpandModule.js';
import { TemplateExpandModule } from '../generators/TemplateExpandModule.js';
import { insertAtMarker, registrationFor } from '../generators/TemplateRegistration.js';
import type { CommandRunner, RunResult } from './CommandRunner.js';
import { DOCKER_FIREBASE_JSON, firebaseJsonPath, planSteps, RUST_IMAGE, VITEST_RESULT_FILE } from './templatesSteps.js';
import type { Step } from './templatesSteps.js';
import { summarizeVitestJson } from './templatesVitest.js';

/**
 * 雛形の自己検査。変種ごとに土台を一時 dir へ写し、固定名で 1 単位を展開し、登録の行を目印の位置に足して、
 * 型・テスト・層の規則・build を実際に通す。前提の道具が無いときは黙って飛ばさず cannot-check (exit 2)。
 */

export const ALL_VARIANTS: readonly TemplateVariant[] = ['hono', 'nestjs', 'rust', 'frontend'];

/** 固定の名前 (雛形の印はこれで埋まる) */
export const FIXED_NAMES: ExpandNames = { context: 'sample', aggregate: 'item', aggregates: 'items', entry: 'probe', feature: 'samples' };
export const FIXED_APP = 'probe-app';

const COPY_EXCLUDE = new Set(['node_modules', 'dist', 'target']);
const TAIL_LINES = 20;

export interface TemplatesCheckOptions {
  readonly variants: readonly TemplateVariant[];
  readonly requireEmulator: boolean;
  /** 作業 dir。省略すると OS の一時 dir に作り、全部成功したら消す。指定した dir は消さない */
  readonly workDir?: string | undefined;
  readonly runner: CommandRunner;
  /** 進捗の出力 */
  readonly log: (line: string) => void;
}

const violation = (message: string): Violation => ({ severity: 'violation', message });
const cannotCheck = (message: string): Violation => ({ severity: 'cannot-check', message });

const tail = (output: string): string => output.trimEnd().split('\n').slice(-TAIL_LINES).join('\n');

const baseSide = (variant: TemplateVariant): string => (variant === 'frontend' ? 'frontend/admin' : 'backend');

export const templateBaseDir = (igetaRoot: string, variant: TemplateVariant): string =>
  variant === 'frontend' ? join(igetaRoot, 'templates/frontend/admin') : join(igetaRoot, 'templates/backend', variant);

/** 展開する 1 単位 (印の付いたフォルダ) */
const unitsOf = (variant: TemplateVariant): ReadonlyArray<{ readonly kind: UnitKind; readonly path: string }> =>
  variant === 'frontend'
    ? [{ kind: 'feature', path: 'src/features/__feature__' }]
    : [
        { kind: 'module', path: 'src/modules/__context__' },
        { kind: 'entry', path: 'src/entries/__entry__' },
      ];

export class TemplatesCheck implements Check {
  readonly name = 'templates-check';
  readonly #options: TemplatesCheckOptions;

  constructor(options: TemplatesCheckOptions) {
    this.#options = options;
  }

  async run(ctx: CheckContext): Promise<readonly Violation[]> {
    const { variants, workDir } = this.#options;
    const root = workDir ?? mkdtempSync(join(tmpdir(), 'igeta-check-templates-'));
    mkdirSync(root, { recursive: true });
    const found: Violation[] = [];
    for (const variant of variants) {
      const result = await this.#checkVariant(variant, root, ctx);
      found.push(...result);
    }
    if (workDir === undefined) {
      if (found.length === 0 || readdirSync(root).length === 0) rmSync(root, { recursive: true, force: true });
      else this.#options.log(`作業 dir を残した (調べる用): ${root}`);
    }
    return found;
  }

  async #checkVariant(variant: TemplateVariant, root: string, ctx: CheckContext): Promise<Violation[]> {
    const { runner, log, requireEmulator } = this.#options;
    const tag = `[${variant}]`;
    const variantDir = join(root, variant);
    const appDir = join(variantDir, 'apps', FIXED_APP, baseSide(variant));
    rmSync(variantDir, { recursive: true, force: true });

    // 1. 前提の道具。無ければ検査不能 (黙って飛ばさない)
    const needsEmulator = variant !== 'frontend';
    let emulator = false;
    if (needsEmulator) {
      emulator = await this.#available('java', ['-version']);
      if (!emulator && requireEmulator) {
        return [cannotCheck(`${tag} --require-emulator だが Java が無い (Firestore emulator を起動できない)`)];
      }
      if (!emulator) log(`${tag} Java が無いので emulator なしで走らせる (emulator の spec は skip)`);
    }
    let rust: 'cargo' | 'docker' = 'cargo';
    if (variant === 'rust') {
      if (await this.#available('cargo', ['--version'])) rust = 'cargo';
      else if (await this.#available('docker', ['info'])) rust = 'docker';
      else return [cannotCheck(`${tag} cargo も Docker も使えない (cargo build / cargo test を走らせられない)`)];
      log(`${tag} ${rust === 'cargo' ? 'cargo を直接使う' : `cargo が無いので Docker (${RUST_IMAGE}) で走らせる`}`);
    }

    // 2. 土台を写し、1 単位を固定名で展開し、登録の行を目印の位置に足す
    log(`${tag} 土台を写して 1 単位を展開する`);
    const baseDir = templateBaseDir(ctx.igetaRoot, variant);
    const units = unitsOf(variant);
    // 土台 = 印の付いた 1 単位・README.md・node_modules・dist・target を除いたもの
    const unitDirs = new Set(units.map((unit) => join(baseDir, unit.path)));
    cpSync(baseDir, appDir, {
      recursive: true,
      filter: (source) => !COPY_EXCLUDE.has(basename(source)) && !unitDirs.has(source) && source !== join(baseDir, 'README.md'),
    });
    const expand = new TemplateExpandModule({ targetRoot: variantDir, igetaRoot: ctx.igetaRoot });
    for (const unit of units) {
      const plan = expand.prepare({ templatePath: join(templateBaseDir(ctx.igetaRoot, variant), unit.path), app: FIXED_APP, names: FIXED_NAMES });
      if (plan.missingNames.length > 0) {
        return [violation(`${tag} ${unit.path}: 展開に必要な名前が固定名に無い: ${plan.missingNames.join(', ')}`)];
      }
      if (plan.violations.length > 0) {
        return plan.violations.map((v) => violation(`${tag} ${unit.path}: 展開に失敗: ${v.message}${v.file === undefined ? '' : ` (${v.file})`}`));
      }
      expand.execute(plan);
    }
    try {
      for (const unit of units) {
        for (const edit of registrationFor(variant, unit.kind, FIXED_NAMES, true)) {
          const file = join(appDir, edit.file);
          writeFileSync(file, insertAtMarker(readFileSync(file, 'utf8'), edit.kind, edit.lines));
        }
      }
    } catch (error) {
      return [violation(`${tag} 登録の行を足せない: ${error instanceof Error ? error.message : String(error)}`)];
    }
    if (variant === 'rust' && rust === 'docker' && emulator) writeFileSync(firebaseJsonPath(variantDir), DOCKER_FIREBASE_JSON);

    // 3. 手順
    const plan = planSteps(variant, { requireEmulator, emulator, rust, variantDir, appDir, runId: basename(root) });
    const found: Violation[] = [];
    for (const step of plan.steps) {
      const outcome = await this.#runStep(variant, step);
      found.push(...outcome.violations);
      if (outcome.stop) break;
    }
    for (const step of plan.cleanup) await runner.run(step.command, step.args, { cwd: step.cwd });
    log(`${tag} ${found.length === 0 ? 'OK' : `違反 ${found.length} 件`}`);
    return found;
  }

  async #available(command: string, args: readonly string[]): Promise<boolean> {
    const result = await this.#options.runner.run(command, args);
    return !result.missing && result.status === 0;
  }

  async #runStep(variant: TemplateVariant, step: Step): Promise<{ violations: Violation[]; stop: boolean }> {
    const { runner, log, requireEmulator } = this.#options;
    const tag = `[${variant}]`;
    log(`${tag} -- ${step.name}`);
    const result: RunResult = await runner.run(step.command, step.args, {
      cwd: step.cwd,
      ...(step.env === undefined ? {} : { env: step.env }),
    });
    if (result.missing) {
      return { violations: [cannotCheck(`${tag} ${step.name}: コマンド ${step.command} が見つからない`)], stop: true };
    }
    const violations: Violation[] = [];
    if (result.status !== 0) {
      violations.push(violation(`${tag} ${step.name} が落ちた (exit ${result.status ?? 'シグナル'})\n${tail(result.output)}`));
    }
    for (const expected of step.expectFiles ?? []) {
      if (result.status === 0 && !existsSync(join(step.cwd, expected))) {
        violations.push(violation(`${tag} ${step.name} が ${expected} を出していない`));
      }
    }
    if (step.kind === 'vitest') violations.push(...this.#vitest(tag, step, result));
    if (step.kind === 'cargo-test' && result.status === 0) violations.push(...this.#cargoSkips(tag, step, result, requireEmulator));
    return { violations, stop: step.fatal === true && result.status !== 0 };
  }

  #vitest(tag: string, step: Step, result: RunResult): Violation[] {
    const { log, requireEmulator } = this.#options;
    const file = join(step.cwd, VITEST_RESULT_FILE);
    if (!existsSync(file)) {
      return result.status === 0 ? [violation(`${tag} ${step.name}: vitest の結果 (${VITEST_RESULT_FILE}) が出ていない`)] : [];
    }
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return [violation(`${tag} ${step.name}: vitest の結果 (${VITEST_RESULT_FILE}) が JSON として読めない`)];
    }
    const summary = summarizeVitestJson(json, requireEmulator);
    log(`${tag} vitest: ${summary.files} ファイル / 合格 ${summary.passed} / 失敗 ${summary.failed} / skip ${summary.skipped.length}`);
    const found: Violation[] = [];
    if (summary.passed + summary.failed === 0) found.push(violation(`${tag} ${step.name}: テストが 1 件も走っていない`));
    for (const skip of summary.skipped) {
      const where = `${relative(step.cwd, skip.file)} › ${skip.title}`;
      if (skip.allowed) log(`${tag}   skip (許可) ${where}: ${skip.reason}`);
      else found.push(violation(`${tag} 許されない skip: ${where} (${skip.reason})`));
    }
    return found;
  }

  #cargoSkips(tag: string, step: Step, result: RunResult, requireEmulator: boolean): Violation[] {
    const skips = result.output.split('\n').filter((line) => line.includes('[skip]'));
    const passed = /test result: ok\. (\d+) passed/g;
    const total = [...result.output.matchAll(passed)].reduce((sum, m) => sum + Number(m[1]), 0);
    this.#options.log(`${tag} cargo test: 合格 ${total} / skip ${skips.length}`);
    const found: Violation[] = [];
    if (total === 0) found.push(violation(`${tag} ${step.name}: テストが 1 件も走っていない`));
    if (skips.length > 0 && requireEmulator) {
      found.push(violation(`${tag} ${step.name}: --require-emulator なのに skip が ${skips.length} 件\n${skips.slice(0, 5).join('\n')}`));
    }
    return found;
  }
}
