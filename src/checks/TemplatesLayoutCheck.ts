import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';
import { ALL_VARIANTS } from './TemplatesCheck.js';

/**
 * templates/ の第 1・第 2 階層の登録制の検査 (spec 11 の L1〜L3)。登録外の名前、実体の無い登録、
 * 9 個目の登録、check-templates の変種との食い違いを落とす。雛形の中は igeta-check-layout の仕事。
 * Igeta 自身の repo だけで走る (利用 repo に templates/ は無い)。
 */

export const MAX_ROOT_ENTRIES = 8;

/** 第 1 階層の登録。値は第 2 階層の登録 (フォルダだけ。README.md などのファイルは数えない)、undefined は葉 */
export interface TemplatesRegistry {
  readonly root: Readonly<Record<string, readonly string[] | undefined>>;
  /** check-templates の変種名 → 置き場 (`backend/hono` の形) */
  readonly variantFolders: Readonly<Record<string, string>>;
  /** check-templates の matrix に無くてよい置き場と、その理由 */
  readonly exempt: Readonly<Record<string, string>>;
}

export const TEMPLATES_REGISTRY: TemplatesRegistry = {
  root: {
    '.github': undefined,
    'README.md': undefined,
    docs: undefined,
    backend: ['hono', 'nestjs', 'rust'],
    frontend: ['admin'],
    mobile: ['ios'],
  },
  variantFolders: { hono: 'backend/hono', nestjs: 'backend/nestjs', rust: 'backend/rust', frontend: 'frontend/admin' },
  exempt: { 'mobile/ios': '自己検査が無い (xcodegen と Xcode のため macOS が要る)' },
};

const IGNORED_NAMES = new Set(['.DS_Store']);

const violation = (message: string): Violation => ({ severity: 'violation', message });

function listNames(dir: string, onlyFolders: boolean): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !IGNORED_NAMES.has(entry.name) && (!onlyFolders || entry.isDirectory()))
    .map((entry) => entry.name);
}

function findRootViolations(templatesDir: string, registry: TemplatesRegistry): Violation[] {
  const registered = Object.keys(registry.root);
  const found = listNames(templatesDir, false);
  const violations: Violation[] = [];
  if (registered.length > MAX_ROOT_ENTRIES) {
    violations.push(violation(`templates/ の登録が ${registered.length} 個ある (上限 ${MAX_ROOT_ENTRIES})。足すなら同じ PR で退かす`));
  }
  for (const name of found.filter((item) => !registered.includes(item))) {
    violations.push(violation(`templates/${name}: 登録外。足すなら ADR-0014 の登録 (TemplatesLayoutCheck) と同じ PR で、置き換わる物を退かす`));
  }
  for (const name of registered.filter((item) => !found.includes(item))) {
    violations.push(violation(`templates/${name}: 登録してあるが実体が無い`));
  }

  return violations;
}

function findSecondTierViolations(templatesDir: string, registry: TemplatesRegistry): Violation[] {
  return Object.entries(registry.root).flatMap(([name, children]) => {
    if (children === undefined || !existsSync(join(templatesDir, name))) return [];
    const found = listNames(join(templatesDir, name), true);
    const unregistered = found.filter((item) => !children.includes(item));
    const missing = children.filter((item) => !found.includes(item));
    return [
      ...unregistered.map((item) => violation(`templates/${name}/${item}: 登録外`)),
      ...missing.map((item) => violation(`templates/${name}/${item}: 登録してあるが実体が無い`)),
    ];
  });
}

/** L3: 登録した backend・frontend の置き場と ALL_VARIANTS が過不足なく一致する。 */
function findMatrixViolations(registry: TemplatesRegistry): Violation[] {
  const registeredFolders = Object.entries(registry.root)
    .filter(([name]) => name === 'backend' || name === 'frontend')
    .flatMap(([name, children]) => (children ?? []).map((child) => `${name}/${child}`));
  const matrixFolders = ALL_VARIANTS.map((variant) => registry.variantFolders[variant]);
  const notInMatrix = registeredFolders.filter((folder) => !matrixFolders.includes(folder) && !(folder in registry.exempt));
  const notRegistered = matrixFolders.filter((folder) => folder === undefined || !registeredFolders.includes(folder));

  return [
    ...notInMatrix.map((folder) => violation(`templates/${folder}: 登録してあるが check-templates の ALL_VARIANTS に無い。matrix に足すか、除外の理由を書く`)),
    ...notRegistered.map((folder) => violation(`check-templates の変種 ${String(folder)} が templates/ の登録に無い`)),
  ];
}

export class TemplatesLayoutCheck implements Check {
  readonly name = 'templates-layout-check';
  readonly #registry: TemplatesRegistry;
  readonly #templatesDir: string | undefined;

  constructor(options: { readonly registry?: TemplatesRegistry; readonly templatesDir?: string } = {}) {
    this.#registry = options.registry ?? TEMPLATES_REGISTRY;
    this.#templatesDir = options.templatesDir;
  }

  run(ctx: CheckContext): readonly Violation[] {
    const templatesDir = this.#templatesDir ?? join(ctx.igetaRoot, 'templates');
    return [
      ...findRootViolations(templatesDir, this.#registry),
      ...findSecondTierViolations(templatesDir, this.#registry),
      ...findMatrixViolations(this.#registry),
    ];
  }
}
