import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { listFiles } from '../core/FileTree.js';
import { toCamel, toPascal, toSnake } from '../core/Naming.js';
import type { Violation } from '../core/Report.js';

/**
 * templates/ の「1 単位」(印の付いたフォルダ 3 つ) を apps/<app>/ の鏡の path へ展開する。
 *   templates/backend/<変種>/src/modules/__context__ → apps/<app>/backend/src/modules/<context>/
 *   templates/frontend/admin/src/features/__feature__ → apps/<app>/frontend/admin/src/features/<feature>/
 * 利用 repo 側の雛形 (<root>/templates/backend/src/…、変種の段なし) も同じ式で写す。
 *
 * 書く前に全部検査し、1 件でも違反なら 1 ファイルも書かない。既存は上書きしない。
 */

export type NameKey = 'context' | 'aggregate' | 'entry' | 'feature';
export type UnitKind = 'entry' | 'module' | 'feature';
export type TemplateVariant = 'hono' | 'nestjs' | 'rust' | 'frontend';

export interface ExpandNames {
  readonly context?: string | undefined;
  readonly aggregate?: string | undefined;
  readonly aggregates?: string | undefined;
  readonly entry?: string | undefined;
  readonly feature?: string | undefined;
}

export interface ExpandRequest {
  /** 雛形の 1 単位のフォルダ (絶対パスか cwd 相当の解決済みパス) */
  readonly templatePath: string;
  readonly app: string;
  readonly names: ExpandNames;
}

export interface ExpandEntry {
  /** 展開先の絶対パス */
  readonly to: string;
  /** targetRoot からの相対パス (/ 区切り) */
  readonly rel: string;
  readonly body: Buffer | string;
}

export interface ExpandPlan {
  readonly violations: readonly Violation[];
  /** 雛形が要求するのに渡されていない名前。1 つでもあれば引数不足 (exit 2) */
  readonly missingNames: readonly NameKey[];
  readonly entries: readonly ExpandEntry[];
  readonly unit?: UnitKind;
  /** Igeta の雛形のときだけ分かる (利用 repo の雛形は変種の段が無い) */
  readonly variant?: TemplateVariant;
}

/** 変種が展開される側 (apps/<app>/ の下の path) */
export const sideOf = (variant: TemplateVariant): 'backend' | 'frontend/admin' => (variant === 'frontend' ? 'frontend/admin' : 'backend');

/** 変種の雛形の根 (templates/backend/<変種> か templates/frontend/admin) */
export const templateBaseDir = (igetaRoot: string, variant: TemplateVariant): string =>
  variant === 'frontend' ? join(igetaRoot, 'templates/frontend/admin') : join(igetaRoot, 'templates/backend', variant);

const VARIANTS: ReadonlySet<string> = new Set(['hono', 'nestjs', 'rust']);

/** 展開できる 1 単位の path (side の根からの相対) */
export const UNITS: ReadonlyArray<{ readonly path: string; readonly kind: UnitKind; readonly side: 'backend' | 'frontend/admin' }> = [
  { path: 'src/entries/__entry__', kind: 'entry', side: 'backend' },
  { path: 'src/modules/__context__', kind: 'module', side: 'backend' },
  { path: 'src/features/__feature__', kind: 'feature', side: 'frontend/admin' },
];

// `__tests__` など、印ではない慣用の名前。
const NOT_MARKS = new Set(['__proto__', '__tests__', '__mocks__', '__snapshots__', '__fixtures__']);
// 印の形: 小文字始まりの camel (`__aggregate__`) か、パスカル (`__Aggregate__`)。全大文字は印ではない。
const MARK_RE = /__(?:[a-z][A-Za-z]*|[A-Z][a-z][A-Za-z]*)__/g;

const MARK_GROUP: ReadonlyMap<string, NameKey> = new Map<string, NameKey>(Object.entries({
  __context__: 'context',
  __Context__: 'context',
  __contextVar__: 'context',
  __aggregate__: 'aggregate',
  __Aggregate__: 'aggregate',
  __aggregates__: 'aggregate',
  __aggregatesPath__: 'aggregate',
  __entry__: 'entry',
  __Entry__: 'entry',
  __feature__: 'feature',
  __Feature__: 'feature',
} satisfies Record<string, NameKey>));

const NAME_KEYS: readonly NameKey[] = ['context', 'aggregate', 'entry', 'feature'];

const found = (text: string): string[] => [...text.matchAll(MARK_RE)].map((m) => m[0]).filter((m) => !NOT_MARKS.has(m));

const violation = (message: string, file?: string): Violation =>
  file === undefined ? { severity: 'violation', message } : { severity: 'violation', message, file };

const toPosix = (path: string): string => path.split(sep).join('/');

/**
 * 印 → 置換値の表。Rust は mod 名がスネークなので全ての印をスネークにするが、
 * URL 用の `__aggregatesPath__` だけはケバブのまま (3 変種で URL を揃える)。
 */
export function buildReplacements(names: ExpandNames, snake: boolean): Map<string, string> {
  const table = new Map<string, string>();
  const form = (kebab: string): string => (snake ? toSnake(kebab) : kebab);
  const { context, aggregate, entry, feature } = names;
  if (context !== undefined) {
    table.set('__context__', form(context));
    table.set('__Context__', toPascal(context));
    table.set('__contextVar__', toCamel(context));
  }
  if (aggregate !== undefined) {
    const plural = names.aggregates ?? `${aggregate}s`;
    table.set('__aggregate__', form(aggregate));
    table.set('__Aggregate__', toPascal(aggregate));
    table.set('__aggregates__', form(plural));
    table.set('__aggregatesPath__', plural);
  }
  if (entry !== undefined) {
    table.set('__entry__', form(entry));
    table.set('__Entry__', toPascal(entry));
  }
  if (feature !== undefined) {
    table.set('__feature__', form(feature));
    table.set('__Feature__', toPascal(feature));
  }
  return table;
}

const replaceMarks = (text: string, table: ReadonlyMap<string, string>): string =>
  text.replace(MARK_RE, (mark) => table.get(mark) ?? mark);

const real = (path: string): string => (existsSync(path) ? realpathSync(path) : resolve(path));

interface Located {
  readonly side: 'backend' | 'frontend/admin';
  readonly unit: (typeof UNITS)[number];
  /** 展開先の側の根 (apps/<app>/backend など) からの相対。印のまま */
  readonly variant?: TemplateVariant;
}

export class TemplateExpandModule {
  readonly #targetRoot: string;
  readonly #igetaRoot: string;

  constructor(ctx: { readonly targetRoot: string; readonly igetaRoot: string }) {
    this.#targetRoot = real(ctx.targetRoot);
    this.#igetaRoot = real(ctx.igetaRoot);
  }

  /** 雛形の path を置き場の規則に当てる。外れたら Violation */
  #locate(templatePath: string): Located | Violation {
    const abs = real(templatePath);
    const bases = [
      { root: join(this.#igetaRoot, 'templates'), igeta: true },
      { root: join(this.#targetRoot, 'templates'), igeta: false },
    ];
    const shape =
      '雛形は templates/backend/<hono|nestjs|rust>/src/{entries/__entry__,modules/__context__} か ' +
      'templates/frontend/admin/src/features/__feature__ の 1 単位だけを渡す';
    for (const base of bases) {
      const rel = relative(base.root, abs);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;
      const parts = toPosix(rel).split('/');
      let side: Located['side'];
      let variant: TemplateVariant | undefined;
      let rest: string[];
      if (parts[0] === 'backend') {
        side = 'backend';
        const second = parts[1];
        if (base.igeta) {
          if (second === undefined || !VARIANTS.has(second)) continue;
          variant = second as TemplateVariant;
          rest = parts.slice(2);
        } else {
          rest = parts.slice(1);
        }
      } else if (parts[0] === 'frontend' && parts[1] === 'admin') {
        side = 'frontend/admin';
        if (base.igeta) variant = 'frontend';
        rest = parts.slice(2);
      } else {
        continue;
      }
      const unit = UNITS.find((u) => u.side === side && u.path === rest.join('/'));
      if (unit === undefined) {
        return violation(`${toPosix(rel)} は展開できる 1 単位ではない (土台は最初に 1 回コピーする)。${shape}`);
      }
      return variant === undefined ? { side, unit } : { side, unit, variant };
    }
    return violation(`雛形の path が ${join(this.#igetaRoot, 'templates')} か ${join(this.#targetRoot, 'templates')} の下ではない: ${templatePath}。${shape}`);
  }

  prepare(request: ExpandRequest): ExpandPlan {
    const located = this.#locate(request.templatePath);
    if ('severity' in located) return { violations: [located], missingNames: [], entries: [] };
    const { unit, side } = located;
    const templateAbs = real(request.templatePath);

    if (!statSync(templateAbs, { throwIfNoEntry: false })?.isDirectory()) {
      return { violations: [violation(`雛形がフォルダではない: ${request.templatePath}`)], missingNames: [], entries: [] };
    }
    const files = listFiles(templateAbs).map((rel) => join(templateAbs, rel));
    if (files.length === 0) {
      return { violations: [violation(`雛形が空: ${request.templatePath}`)], missingNames: [], entries: [] };
    }

    const loaded = files.map((file) => {
      const raw = readFileSync(file);
      return { rel: toPosix(relative(templateAbs, file)), raw, text: raw.includes(0) ? undefined : raw.toString('utf8') };
    });

    // 必要な名前 = 雛形の path と中身にある印から求める
    const required = new Set<NameKey>();
    const scan = (text: string): void => {
      for (const mark of found(text)) {
        const key = MARK_GROUP.get(mark);
        if (key !== undefined) required.add(key);
      }
    };
    scan(unit.path);
    for (const f of loaded) {
      scan(f.rel);
      if (f.text !== undefined) scan(f.text);
    }
    const missingNames = NAME_KEYS.filter((key) => required.has(key) && request.names[key] === undefined);
    const base = { unit: unit.kind, ...(located.variant === undefined ? {} : { variant: located.variant }) };
    if (missingNames.length > 0) return { ...base, violations: [], missingNames, entries: [] };

    const snake = loaded.some((f) => f.rel.endsWith('.rs'));
    const table = buildReplacements(request.names, snake);
    const destDir = join(this.#targetRoot, 'apps', request.app, side, replaceMarks(unit.path, table));

    const violations: Violation[] = [];
    const entries: ExpandEntry[] = [];
    const seen = new Set<string>();
    for (const f of loaded) {
      const targetRel = replaceMarks(f.rel, table);
      const body = f.text === undefined ? f.raw : replaceMarks(f.text, table);
      const to = join(destDir, targetRel);
      const rel = toPosix(relative(this.#targetRoot, to));
      if (seen.has(targetRel)) violations.push(violation(`置換後に同じ名前になるファイルがある: ${targetRel}`, rel));
      seen.add(targetRel);
      for (const mark of found(targetRel)) violations.push(violation(`置換されない印が名前に残る: ${mark}`, rel));
      if (typeof body === 'string') {
        for (const mark of new Set(found(body))) violations.push(violation(`置換されない印が中身に残る: ${mark}`, rel));
      }
      if (existsSync(to)) violations.push(violation('展開先に既存がある (上書きしない)', rel));
      entries.push({ to, rel, body });
    }
    // 親フォルダ名の `__work__` などを印と誤検出しないよう、targetRoot からの相対だけを見る
    const destRel = toPosix(relative(this.#targetRoot, destDir));
    for (const mark of found(destRel)) violations.push(violation(`置換されない印が展開先に残る: ${mark}`, destRel));

    return { ...base, violations, missingNames: [], entries };
  }

  /** 検査を通った plan を書く。既存は上書きしない (wx)。 */
  execute(plan: ExpandPlan): void {
    if (plan.violations.length > 0 || plan.missingNames.length > 0) {
      throw new Error('違反のある plan は書けない');
    }
    for (const entry of plan.entries) {
      mkdirSync(dirname(entry.to), { recursive: true });
      writeFileSync(entry.to, entry.body, { flag: 'wx' });
    }
  }
}
