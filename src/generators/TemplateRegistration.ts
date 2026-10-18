import { toCamel, toPascal, toSnake } from '../core/Naming.js';
import type { TemplateVariant, UnitKind } from './TemplateExpandModule.js';

/**
 * 1 単位を展開したあとに「足す行」の正本。挿入点は土台のファイルに置いたコメントの目印
 * `// @igeta:register-<kind>`。`igeta expand` は NEXT として案内し、`igeta check-templates` は同じ行を実際に足す。
 * 目印は消さない (足した行は目印の直前に入る。単位を足すたびに同じ目印を使う)。
 */

export type RegistrationKind = 'import' | 'module' | 'verify' | 'entry' | 'route' | 'mod';

export const markerOf = (kind: RegistrationKind): string => `// @igeta:register-${kind}`;

export interface RegistrationEdit {
  /** 展開先の側の根 (apps/<app>/backend など) からの path */
  readonly file: string;
  readonly kind: RegistrationKind;
  readonly lines: readonly string[];
}

/** 土台のファイルごとの目印の一覧。各ファイルに目印がちょうど 1 つあることを試験が見る。 */
export const MARKER_FILES: ReadonlyArray<{
  readonly variant: TemplateVariant;
  readonly file: string;
  readonly kinds: readonly RegistrationKind[];
}> = [
  { variant: 'hono', file: 'src/index.ts', kinds: ['import', 'module', 'verify', 'entry'] },
  { variant: 'nestjs', file: 'src/app.module.ts', kinds: ['import', 'verify', 'entry'] },
  { variant: 'rust', file: 'src/entries/mod.rs', kinds: ['mod'] },
  { variant: 'rust', file: 'src/modules/mod.rs', kinds: ['mod'] },
  { variant: 'rust', file: 'src/main.rs', kinds: ['verify', 'module', 'entry'] },
  { variant: 'frontend', file: 'src/app/routes.ts', kinds: ['import', 'route'] },
];

export interface RegistrationNames {
  readonly context?: string | undefined;
  readonly entry?: string | undefined;
  readonly feature?: string | undefined;
}

/**
 * 足す行。`withVerify` は偽の verify (常に claims を返す) も足す。check-templates 用。
 * 実アプリは verify を自分で作るので、expand の NEXT には入れない。
 */
export function registrationFor(
  variant: TemplateVariant,
  unit: UnitKind,
  names: RegistrationNames,
  withVerify: boolean,
): readonly RegistrationEdit[] {
  const { context, entry, feature } = names;
  const edits: RegistrationEdit[] = [];
  const add = (file: string, kind: RegistrationKind, lines: readonly string[]): void => {
    edits.push({ file, kind, lines });
  };

  if (variant === 'hono') {
    if (unit === 'module' && context !== undefined) {
      add('src/index.ts', 'import', [`import { create${toPascal(context)}Module } from '@/modules/${context}/index.js';`]);
      add('src/index.ts', 'module', [`const ${toCamel(context)} = create${toPascal(context)}Module(db);`]);
    }
    if (unit === 'entry' && entry !== undefined && context !== undefined) {
      add('src/index.ts', 'import', [`import { create${toPascal(entry)}Routes } from '@/entries/${entry}/${entry}.routes.js';`]);
      if (withVerify) {
        add('src/index.ts', 'import', ["import { ok } from '@/shared/domain/result.js';"]);
        add('src/index.ts', 'verify', [`const verify = async () => ok({ subject: '${entry}' });`]);
      }
      add('src/index.ts', 'entry', [`app.route('/${entry}', create${toPascal(entry)}Routes({ verify, ${toCamel(context)} }));`]);
    }
  }

  if (variant === 'nestjs' && unit === 'entry' && entry !== undefined) {
    add('src/app.module.ts', 'import', [`import { ${toPascal(entry)}EntryModule } from '@/entries/${entry}/${entry}.entry.module.js';`]);
    if (withVerify) {
      add('src/app.module.ts', 'import', ["import { ok } from '@/shared/domain/result.js';"]);
      add('src/app.module.ts', 'verify', [`const verify = async () => ok({ subject: '${entry}' });`]);
    }
    add('src/app.module.ts', 'entry', [`${toPascal(entry)}EntryModule.register({ verify }),`]);
  }

  if (variant === 'rust') {
    if (unit === 'module' && context !== undefined) {
      const mod = toSnake(context);
      add('src/modules/mod.rs', 'mod', [`pub mod ${mod};`]);
      add('src/main.rs', 'module', [`let ${mod} = backend::modules::${mod}::create_module(db.clone());`]);
    }
    if (unit === 'entry' && entry !== undefined && context !== undefined) {
      const mod = toSnake(entry);
      const path = `backend::entries::${mod}`;
      add('src/entries/mod.rs', 'mod', [`pub mod ${mod};`]);
      if (withVerify) {
        add('src/main.rs', 'verify', [
          'struct CheckVerifier;',
          `impl ${path}::Verifier for CheckVerifier {`,
          `    async fn verify(&self, _request: ${path}::VerifyRequest<'_>) -> backend::shared::domain::result::AppResult<${path}::Claims> {`,
          `        Ok(${path}::Claims { subject: "${entry}".to_string() })`,
          '    }',
          '}',
        ]);
      }
      add('src/main.rs', 'entry', [
        `let app = app.nest("/${entry}", ${path}::routes(${path}::RoutesDeps { verify: ${withVerify ? 'CheckVerifier' : 'verify'}, ${toSnake(context)} }));`,
      ]);
    }
  }

  if (variant === 'frontend' && unit === 'feature' && feature !== undefined) {
    add('src/app/routes.ts', 'import', [`import { ${toPascal(feature)}Screen } from '@/features/${feature}';`]);
    add('src/app/routes.ts', 'route', [`{ path: '/${feature}', screen: ${toPascal(feature)}Screen },`]);
  }

  return edits;
}

/** source の目印 1 つの直前に lines を足す (目印は残す)。目印がちょうど 1 つでなければ投げる。 */
export function insertAtMarker(source: string, kind: RegistrationKind, lines: readonly string[]): string {
  const marker = markerOf(kind);
  const rows = source.split('\n');
  const hits = rows.flatMap((row, index) => (row.trim() === marker ? [index] : []));
  const at = hits[0];
  if (hits.length !== 1 || at === undefined) {
    throw new Error(`目印 ${marker} が ${hits.length} 個ある (ちょうど 1 個必要)`);
  }
  const indent = (rows[at] ?? '').match(/^\s*/)?.[0] ?? '';
  rows.splice(at, 0, ...lines.map((line) => (line === '' ? line : `${indent}${line}`)));
  return rows.join('\n');
}

/** expand の NEXT 行。変種が分かるときだけ具体的に、分からなければ README へ誘導する。 */
export function nextSteps(variant: TemplateVariant | undefined, unit: UnitKind | undefined, names: RegistrationNames): readonly string[] {
  if (variant === undefined || unit === undefined) {
    return ['各変種の README の「展開後に足す行」を、土台の @igeta:register-* の位置に足す'];
  }
  const edits = registrationFor(variant, unit, names, false);
  if (edits.length === 0) return [];
  const lines = edits.flatMap((edit) => [`${edit.file} の ${markerOf(edit.kind)} の上に足す:`, ...edit.lines.map((line) => `  ${line}`)]);
  if (unit === 'entry') lines.push('verify (署名・トークンの検証) はこのアプリで作って渡す');
  return lines;
}
