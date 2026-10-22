import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import { violation } from '../core/Report.js';
import { ALL_VARIANTS } from './TemplatesCheck.js';
import type { TemplatesRegistry } from './TemplatesRegistry.js';
import { TEMPLATES_REGISTRY } from './TemplatesRegistry.js';

/**
 * templates/ の登録制の検査 (spec 11 の L1〜L5)。第 1・第 2 階層の登録外・実体の無い登録・9 個目、
 * 登録した置き場と check-templates の変種の食い違いを落とし、変種ごとに igeta-check-layout を回す。
 * Igeta 自身の repo だけで走る (利用 repo に templates/ は無い)。
 */

export const MAX_ROOT_ENTRIES = 8;
const CHECK_LAYOUT_SCRIPT = join('library', 'eslint-config', 'check-layout.js');
const SECOND_TIER_FILES = ['README.md'];
/** OS が作る残骸。登録外として数えない */
const OS_JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*)$/;

function listNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => !OS_JUNK.test(entry.name)).map((entry) => entry.name);
}

function findRootViolations(templatesDir: string, registry: TemplatesRegistry): Violation[] {
  const registered = Object.keys(registry.root);
  const found = listNames(templatesDir);
  const violations: Violation[] = [];
  if (registered.length > MAX_ROOT_ENTRIES) {
    violations.push(violation(`templates/ の登録が ${registered.length} 個ある (上限 ${MAX_ROOT_ENTRIES})。足すなら同じ PR で退かす`));
  }
  for (const name of found.filter((item) => !registered.includes(item))) {
    violations.push(violation(`templates/${name}: 登録外。足すなら ADR-0014 の登録 (TemplatesRegistry) と同じ PR で、置き換わる物を退かす`));
  }
  for (const name of registered.filter((item) => !found.includes(item))) {
    violations.push(violation(`templates/${name}: 登録してあるが実体が無い`));
  }

  return violations;
}

/** 第 2 階層は、登録したフォルダと README.md だけを許す (ファイルも数える)。 */
function findSecondTierViolations(templatesDir: string, registry: TemplatesRegistry): Violation[] {
  return Object.entries(registry.root).flatMap(([name, children]) => {
    if (children === undefined || !existsSync(join(templatesDir, name))) return [];
    const found = listNames(join(templatesDir, name));
    const unregistered = found.filter((item) => !children.includes(item) && !SECOND_TIER_FILES.includes(item));
    const missing = children.filter((item) => !found.includes(item));
    return [
      ...unregistered.map((item) => violation(`templates/${name}/${item}: 登録外`)),
      ...missing.map((item) => violation(`templates/${name}/${item}: 登録してあるが実体が無い`)),
    ];
  });
}

/** L3: 第 2 階層の全フォルダが variants か exempt のどちらかにあり、ALL_VARIANTS と過不足なく一致する。 */
function findMatrixViolations(registry: TemplatesRegistry): Violation[] {
  const folders = Object.entries(registry.root).flatMap(([name, children]) => (children ?? []).map((child) => `${name}/${child}`));
  const variantFolders = registry.variants.map((item) => item.folder);
  const violations: Violation[] = [];
  for (const folder of folders.filter((item) => !variantFolders.includes(item) && !(item in registry.exempt))) {
    violations.push(violation(`templates/${folder}: check-templates の変種にも除外にも登録が無い。matrix に足すか、除外の理由を書く`));
  }
  for (const item of registry.variants.filter((entry) => !folders.includes(entry.folder))) {
    violations.push(violation(`変種 ${item.variant}: 置き場 templates/${item.folder} が第 2 階層の登録に無い`));
  }
  for (const folder of Object.keys(registry.exempt).filter((item) => !folders.includes(item))) {
    violations.push(violation(`templates/${folder}: 除外に書いてあるが第 2 階層の登録に無い`));
  }
  for (const variant of ALL_VARIANTS.filter((name) => !registry.variants.some((item) => item.variant === name))) {
    violations.push(violation(`check-templates の変種 ${variant} が templates/ の登録に無い`));
  }

  return violations;
}

/** 変種ごとに igeta-check-layout を回し、全変種の違反を 1 回で返す。 */
function findInnerViolations(igetaRoot: string, templatesDir: string, registry: TemplatesRegistry): Violation[] {
  return registry.variants.flatMap((item) => {
    const srcDir = join(templatesDir, item.folder, 'src');
    const extArgs = item.extensions.length === 0 ? [] : ['--ext', item.extensions.join(',')];
    const result = spawnSync('node', [join(igetaRoot, CHECK_LAYOUT_SCRIPT), srcDir, ...extArgs], { encoding: 'utf8' });
    if (result.status === 0) return [];
    const lines = `${result.stderr}${result.error?.message ?? ''}`.split('\n').filter((line) => line !== '');
    return (lines.length === 0 ? [`終了コード ${String(result.status)}`] : lines).map((line) => violation(`[${item.variant}] ${line}`));
  });
}

export interface TemplatesLayoutOptions {
  readonly registry?: TemplatesRegistry;
  readonly templatesDir?: string;
  /** false なら雛形の中の igeta-check-layout を回さない (登録だけを試すテスト用) */
  readonly isInnerChecked?: boolean;
}

export class TemplatesLayoutCheck implements Check {
  readonly name = 'templates-layout-check';
  readonly #registry: TemplatesRegistry;
  readonly #templatesDir: string | undefined;
  readonly #isInnerChecked: boolean;

  constructor(options: TemplatesLayoutOptions = {}) {
    this.#registry = options.registry ?? TEMPLATES_REGISTRY;
    this.#templatesDir = options.templatesDir;
    this.#isInnerChecked = options.isInnerChecked ?? true;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const templatesDir = this.#templatesDir ?? join(ctx.igetaRoot, 'templates');
    return [
      ...findRootViolations(templatesDir, this.#registry),
      ...findSecondTierViolations(templatesDir, this.#registry),
      ...findMatrixViolations(this.#registry),
      ...(this.#isInnerChecked ? findInnerViolations(ctx.igetaRoot, templatesDir, this.#registry) : []),
    ];
  }
}
