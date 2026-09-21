import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';

/**
 * templates/ の雛形を <targetRoot>/apps/ へ展開する。
 * 展開直後の module は dependency-cruiser のレイヤ規約を満たし、
 * 生成される domain クラス名を図に貼れば DomainDiagramDriftCheck が緑になる。
 *
 * 既存ファイルは決して上書きしない。1 件でも衝突したら 1 ファイルも書かない。
 */

export type ScaffoldKind = 'api' | 'web';

export interface ScaffoldRequest {
  readonly kind: ScaffoldKind;
  /** kind: 'api' のとき必須。kebab-case */
  readonly context?: string;
  /** kind: 'api' のとき必須。PascalCase */
  readonly aggregate?: string;
  /** kind: 'web' のとき必須。kebab-case */
  readonly feature?: string;
  /** 初回のみ: templates/api-shared-kernel も展開する */
  readonly includeKernel?: boolean;
  /** テストが時刻を固定するための差し替え口 */
  readonly now?: Date;
}

export interface ScaffoldEntry {
  /** テンプレート側の絶対パス */
  readonly from: string;
  /** 展開先の絶対パス */
  readonly to: string;
}

export interface ScaffoldResult {
  /** 実際に書き出した一覧 */
  readonly written: readonly ScaffoldEntry[];
  /** 既存ファイルと衝突した一覧。1 件でもあれば written は空 */
  readonly conflicts: readonly ScaffoldEntry[];
  /** kind: 'api' のとき、図に貼るべき class 宣言の案内 */
  readonly nextSteps: readonly string[];
}

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;
const PLACEHOLDER_RE =
  /__(context|Context|contextCamel|CONTEXT|aggregate|Aggregate|aggregateCamel|AGGREGATE|feature|Feature|featureCamel|timestamp)__/g;

type Replacements = Readonly<Record<string, string>>;

const toPascal = (kebab: string): string =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const toCamel = (pascal: string): string => pascal.charAt(0).toLowerCase() + pascal.slice(1);

const toKebab = (pascal: string): string =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const toConst = (pascal: string): string => toKebab(pascal).replace(/-/g, '_').toUpperCase();

/** UTC の YYYYMMDDhhmmss */
function timestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function substitute(text: string, replacements: Replacements): string {
  return text.replace(PLACEHOLDER_RE, (match: string, key: string) => {
    const value = replacements[key];
    if (value === undefined) {
      throw new Error(`テンプレートのプレースホルダ ${match} に対応する値が無い`);
    }
    return value;
  });
}

function collectFiles(dir: string, base: string = dir): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, base));
    else files.push(relative(base, full));
  }
  return files;
}

export class ScaffoldModule {
  readonly #ctx: CheckContext;

  constructor(ctx: CheckContext) {
    this.#ctx = ctx;
  }

  /** 引数の妥当性検証。問題があれば Violation を返す (空なら妥当) */
  validate(request: ScaffoldRequest): readonly Violation[] {
    const violations: Violation[] = [];
    if (request.kind !== 'api' && request.kind !== 'web') {
      violations.push({ severity: 'violation', message: 'kind は api か web' });
      return violations;
    }
    if (request.kind === 'api') {
      if (request.context === undefined || !KEBAB_RE.test(request.context)) {
        violations.push({ severity: 'violation', message: 'context は kebab-case 必須 (例: booking)' });
      }
      if (request.aggregate === undefined || !PASCAL_RE.test(request.aggregate)) {
        violations.push({ severity: 'violation', message: 'aggregate は PascalCase 必須 (例: Reservation)' });
      }
    } else if (request.feature === undefined || !KEBAB_RE.test(request.feature)) {
      violations.push({ severity: 'violation', message: 'feature は kebab-case 必須 (例: booking)' });
    }
    return violations;
  }

  /** 書き出さずに展開計画だけ返す */
  plan(request: ScaffoldRequest): readonly ScaffoldEntry[] {
    const replacements = this.#replacements(request);
    const apiRoot = join(this.#ctx.targetRoot, 'apps', 'api');

    if (request.kind === 'web') {
      return this.#planTemplate('web-feature', join(this.#ctx.targetRoot, 'apps', 'web'), replacements);
    }

    const moduleEntries = this.#planTemplate('api-module', apiRoot, replacements);
    if (request.includeKernel !== true) return moduleEntries;
    return [...this.#planTemplate('api-shared-kernel', apiRoot, replacements), ...moduleEntries];
  }

  /** 展開する。衝突が 1 件でもあれば 1 ファイルも書かない */
  execute(request: ScaffoldRequest): ScaffoldResult {
    const replacements = this.#replacements(request);
    const entries = this.plan(request);

    const conflicts = entries.filter((entry) => existsSync(entry.to));
    if (conflicts.length > 0) return { written: [], conflicts, nextSteps: [] };

    for (const entry of entries) {
      const content = substitute(readFileSync(entry.from, 'utf8'), replacements);
      mkdirSync(dirname(entry.to), { recursive: true });
      writeFileSync(entry.to, content);
    }
    return { written: entries, conflicts: [], nextSteps: this.#nextSteps(request, replacements) };
  }

  #replacements(request: ScaffoldRequest): Replacements {
    const violations = this.validate(request);
    const first = violations[0];
    if (first !== undefined) throw new Error(first.message);

    const now = request.now ?? new Date();
    if (request.kind === 'web') {
      const feature = request.feature;
      if (feature === undefined) throw new Error('feature は kebab-case 必須 (例: booking)');
      return {
        feature,
        Feature: toPascal(feature),
        featureCamel: toCamel(toPascal(feature)),
      };
    }

    const context = request.context;
    const aggregate = request.aggregate;
    if (context === undefined) throw new Error('context は kebab-case 必須 (例: booking)');
    if (aggregate === undefined) throw new Error('aggregate は PascalCase 必須 (例: Reservation)');
    return {
      context,
      Context: toPascal(context),
      contextCamel: toCamel(toPascal(context)),
      CONTEXT: context.replace(/-/g, '_').toUpperCase(),
      aggregate: toKebab(aggregate),
      Aggregate: aggregate,
      aggregateCamel: toCamel(aggregate),
      AGGREGATE: toConst(aggregate),
      timestamp: timestamp(now),
    };
  }

  #planTemplate(name: string, destDir: string, replacements: Replacements): readonly ScaffoldEntry[] {
    const templateDir = join(this.#ctx.igetaRoot, 'templates', name);
    if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
      throw new Error(`テンプレートが無い: ${templateDir}`);
    }
    return collectFiles(templateDir).map((relPath) => ({
      from: join(templateDir, relPath),
      to: join(destDir, substitute(relPath, replacements)),
    }));
  }

  #nextSteps(request: ScaffoldRequest, replacements: Replacements): readonly string[] {
    if (request.kind !== 'api') return [];
    const context = replacements['context'];
    const aggregate = replacements['Aggregate'];
    if (context === undefined || aggregate === undefined) return [];
    return [
      `docs/design/detail/domain/${context}.md に code_root: apps/api/src/modules/${context}`,
      'と下記 class 宣言を書く (書くまで domain-drift は DRIFT で落ちる):',
      `  class ${aggregate}`,
      `  class ${aggregate}Id`,
      `  class ${aggregate}Status`,
      `  class ${aggregate}CreatedEvent`,
      `  class ${aggregate}RepositoryPort`,
    ];
  }
}
