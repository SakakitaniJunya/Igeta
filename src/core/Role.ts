// kind → 置き場所の正本のコード側 (docs/product/02-audience-directories.md §7 の表の転記。REQ-102)。
// 決定の記録は ADR-0001 (確定させる人で 3 つに分ける) と ADR-0009 (置き場所の表)。
//
// 表を直すときは、まず §7 を直し、ここを写す。TaxonomyGuideSync.test.ts が §7 とこの表を突き合わせ、
// Role.test.ts が ARC42_BY_KIND と kind の集合が一致することを見る。
//
// パターンは docs/ からの相対パスの glob (区切りは `/`)。使える記法は次の 5 つだけ。
//   `*`              1 階層の中の任意の文字 (`/` を含まない)
//   `<c>`            まとまり (context) の名前 1 階層。当たった名前が context (`shared` を含む)。ただし、同じ階層に
//                    固定のフォルダとして置く名前 (`ai/specs/` の下の `tasks`) は、まとまりの名前ではないので除く。
//                    context-contract の `<c>` は `shared` も除く (KINDS_WITHOUT_SHARED_CONTEXT)
//   `<year>`         西暦 4 桁の 1 階層 (日付のある記録)
//   `<deliverable>`  提出物の名前 1 階層
//   `NN`             2 桁の連番
// パターンの階層に `shared` と書いたものは、まとまり `shared` のフォルダを表す。判定に使う入力は
// frontmatter の kind と context だけ (REQ-201)。ファイル名の連番は読む順であって種類ではないので、名前を自由に
// 付ける文書は `*` で受ける。`NN` を使うのは、名前に kind が入る固定の文書 (NN-<kind>.md・NN-glossary.md) だけ。

import { join } from 'node:path';
import { SHARED_CONTEXT } from './Context.js';
import { isDirectory } from './DocFiles.js';

/** 確定させる人。docs/ 直下のフォルダ名と同じ (ADR-0001) */
export type Role = 'person' | 'ai' | 'client';

export const ROLES: readonly Role[] = ['person', 'ai', 'client'];

/** 型の検査の区分。表の ○ (full) / 図 (diagram) / — (none) */
export type FormCheck = 'full' | 'diagram' | 'none';

export type DiagramKind = 'flowchart' | 'mindmap' | 'quadrantChart' | 'gantt' | 'timeline' | 'sequenceDiagram' | 'stateDiagram';

export interface Placement {
  readonly kind: string;
  readonly role: Role;
  /** 置ける場所。docs/ からの相対パスの glob。空なら利用 repo には置かない kind */
  readonly patterns: readonly string[];
  readonly formCheck: FormCheck;
  /** kind が許す図種。空なら図を要しない (adr・feature-brief など) */
  readonly diagrams: readonly DiagramKind[];
}

const place = (
  kind: string,
  role: Role,
  patterns: readonly string[],
  formCheck: FormCheck,
  diagrams: readonly DiagramKind[] = [],
): Placement => ({ kind, role, patterns, formCheck, diagrams });

/** `person/design/shared/` の固定番号の文書。100 行を超えたら `person/design/<c>/NN-<kind>.md` にも置ける */
const personSharedFixed = (kind: string, diagrams: readonly DiagramKind[] = []): Placement =>
  place(kind, 'person', ['person/design/shared/*.md', `person/design/<c>/NN-${kind}.md`], 'full', diagrams);

const aiShared = (kind: string): Placement => place(kind, 'ai', ['ai/specs/shared/*.md'], 'none');

const aiPerContext = (kind: string, dir: string): Placement =>
  place(kind, 'ai', [`ai/specs/<c>/${dir}/*.md`], 'none');

/** 15 本を超えたら、まとまりの下位フォルダ (`shared` を含む) へ全部移す (§7 の「決まり」の最終行) */
const splittable = (dir: string): readonly string[] => [`${dir}/*.md`, `${dir}/<c>/*.md`];

/** §7 の表の行の順。人 (18) → AI (27) → 顧客 (2) の計 47 kind。図種は要件 02 §8 の正本 */
export const PLACEMENTS: readonly Placement[] = [
  // person: 確定する前に人が全部読んで承認する
  place('map', 'person', ['person/design/shared/00-map.md'], 'diagram', ['flowchart', 'mindmap']),
  place('context-map', 'person', ['person/design/<c>/00-map.md'], 'diagram', ['flowchart']),
  // 01-requirements.md が本体。150 行を超えたら NN-<まとまり>.md へ分ける
  place('requirements', 'person', ['person/requirements/01-requirements.md', 'person/requirements/*.md'], 'full', ['flowchart']),
  personSharedFixed('function-list', ['mindmap', 'flowchart']),
  personSharedFixed('solution-strategy', ['flowchart']),
  personSharedFixed('nonfunctional', ['quadrantChart', 'mindmap']),
  personSharedFixed('permission-matrix', ['flowchart']),
  personSharedFixed('data-management', ['flowchart']),
  personSharedFixed('as-is-overview', ['flowchart']),
  personSharedFixed('risks-tech-debt', ['quadrantChart']),
  personSharedFixed('operations', ['flowchart']),
  personSharedFixed('migration-plan', ['flowchart', 'gantt', 'timeline']),
  place('business-flow', 'person', ['person/design/<c>/flows/*.md'], 'full', ['flowchart', 'sequenceDiagram']),
  place('screen-spec', 'person', ['person/design/<c>/screens/*.md'], 'full', ['flowchart', 'stateDiagram']),
  place('feature-brief', 'person', ['person/design/<c>/features/*.md'], 'none', []),
  place('glossary', 'person', ['person/design/shared/NN-glossary.md'], 'none', ['flowchart', 'mindmap']),
  place('adr', 'person', ['person/decisions/<year>/*.md'], 'none', []),
  place('decision-log', 'person', ['person/decisions/01-decisions.md'], 'none', ['flowchart', 'timeline']),

  // ai: AI が書き、評価する AI が確定させる
  aiShared('crosscutting'),
  aiShared('code-definitions'),
  aiShared('messages'),
  aiShared('i18n'),
  aiShared('infra-design'),
  aiShared('secrets-management'),
  aiShared('external-integration'),
  aiShared('test-plan'),
  aiShared('domain-overview'),
  aiShared('aggregate-map'),
  place('context-contract', 'ai', ['ai/specs/<c>/contract.md'], 'none'),
  aiPerContext('api-spec', 'api'),
  aiPerContext('table-spec', 'tables'),
  aiPerContext('domain-model', 'domain'),
  aiPerContext('sequence-spec', 'sequences'),
  aiPerContext('state-machine', 'state-machines'),
  aiPerContext('module-spec', 'modules'),
  aiPerContext('job', 'jobs'),
  aiPerContext('test-spec', 'tests'),
  place('tasks', 'ai', splittable('ai/specs/tasks'), 'none'),
  place('guide', 'ai', splittable('ai/handbook/how-to'), 'none'),
  place('explanation', 'ai', splittable('ai/handbook/explanation'), 'none'),
  place('runbook', 'ai', splittable('ai/handbook/runbooks'), 'none'),
  place(
    'implementation-order',
    'ai',
    ['ai/handbook/how-to/02-implementation-order.md', 'ai/handbook/how-to/<c>/02-implementation-order.md'],
    'none',
  ),
  // 利用 repo には置かない。AGENTS.md と docs/README.md から、版に固定した Igeta の手引きを指す
  place('document-taxonomy', 'ai', [], 'none'),
  place('human-review', 'ai', [], 'none'),
  place('provenance-workflow', 'ai', [], 'none'),

  // client: 顧客と合意して渡す
  place('delivery-chapter', 'client', ['client/delivery/<deliverable>/*.md'], 'none'),
  place('proposal', 'client', ['client/proposals/<year>/*.md'], 'none'),
];

function indexByKind(placements: readonly Placement[]): ReadonlyMap<string, Placement> {
  const byKind = new Map<string, Placement>();
  for (const placement of placements) {
    if (byKind.has(placement.kind)) throw new Error(`Role.ts: kind が重複している: ${placement.kind}`);
    byKind.set(placement.kind, placement);
  }
  return byKind;
}

/** kind → 置き場所。kind の集合は ARC42_BY_KIND と一致する (Role.test.ts) */
export const ROLE_OF_KIND: ReadonlyMap<string, Placement> = indexByKind(PLACEMENTS);

export function placementOf(kind: string): Placement | undefined {
  return ROLE_OF_KIND.get(kind);
}

// ---------------------------------------------------------------------------
// パターンの照合
// ---------------------------------------------------------------------------

interface CompiledPattern {
  readonly regex: RegExp;
  /** ワイルドカードを除いた文字数。大きいほど具体的なパターン */
  readonly literalLength: number;
  /** `shared` と書いた階層を持つ (まとまり `shared` のフォルダ) */
  readonly hasSharedSegment: boolean;
}

const WILDCARD_REGEX: ReadonlyMap<string, string> = new Map([
  ['<year>', '\\d{4}'],
  ['<deliverable>', '[^/]+'],
  ['*', '[^/]*'],
  ['NN', '\\d{2}'],
]);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NO_NAMES: ReadonlySet<string> = new Set();

/** `<c>` の正規表現。当たった名前は context。excluded の名前 (階層の全体が一致するもの) には当たらない */
function contextSource(excluded: ReadonlySet<string>): string {
  const names = [...excluded].map(escapeRegExp);
  return `(?<context>${names.length === 0 ? '' : `(?!(?:${names.join('|')})(?:/|$))`}[^/]+)`;
}

function compilePattern(source: string, excluded: ReadonlySet<string> = NO_NAMES): CompiledPattern {
  let body = '';
  let literalLength = 0;
  for (const token of source.split(/(<c>|<year>|<deliverable>|NN|\*)/)) {
    const wildcard = token === '<c>' ? contextSource(excluded) : WILDCARD_REGEX.get(token);
    if (wildcard !== undefined) {
      body += wildcard;
    } else {
      body += escapeRegExp(token);
      literalLength += token.length;
    }
  }
  return {
    regex: new RegExp(`^${body}$`),
    literalLength,
    hasSharedSegment: source.split('/').includes(SHARED_CONTEXT),
  };
}

const isLiteralSegment = (segment: string): boolean => !/<c>|<year>|<deliverable>|NN|\*/.test(segment);

/**
 * 固定のフォルダの名前。ワイルドカードを含まない親の下にある、ワイルドカードを含まない階層 (ファイル名を除く)。
 * キーは親のフォルダ。`ai/specs` の下は shared と tasks (`ai/specs/shared/`・`ai/specs/tasks/`)。
 */
function fixedFolders(placements: readonly Placement[]): ReadonlyMap<string, ReadonlySet<string>> {
  const folders = new Map<string, Set<string>>();
  for (const placement of placements) {
    for (const pattern of placement.patterns) {
      const segments = pattern.split('/').slice(0, -1);
      for (let i = 0; i < segments.length; i += 1) {
        const name = segments[i] ?? '';
        if (!segments.slice(0, i + 1).every(isLiteralSegment)) break;
        const parent = segments.slice(0, i).join('/');
        folders.set(parent, (folders.get(parent) ?? new Set<string>()).add(name));
      }
    }
  }
  return folders;
}

const FIXED_FOLDERS = fixedFolders(PLACEMENTS);

/**
 * `<c>` に shared を含めない kind。全体共通 (shared) はどのまとまりからも引けるので、まとまりの間の約束
 * (contract) を持たない (ADR-0004 決定 3 の 3・4)。他の kind の `<c>` は shared を含む。
 */
const KINDS_WITHOUT_SHARED_CONTEXT: ReadonlySet<string> = new Set(['context-contract']);

/**
 * パターンの `<c>` が当たらない名前。同じ階層に固定のフォルダとして置く名前は、まとまりの名前ではない
 * (`ai/specs/tasks/` は実装タスクのフォルダで、tasks というまとまりではない)。shared は固定のフォルダでも
 * まとまり (全体共通) として使えるので除かない。ただし、KINDS_WITHOUT_SHARED_CONTEXT の kind では除く。
 */
function compilePlacementPatterns(placement: Placement): readonly CompiledPattern[] {
  return placement.patterns.map((pattern) => {
    const segments = pattern.split('/');
    const at = segments.indexOf('<c>');
    const excluded = new Set<string>(at === -1 ? [] : (FIXED_FOLDERS.get(segments.slice(0, at).join('/')) ?? []));
    excluded.delete(SHARED_CONTEXT);
    if (KINDS_WITHOUT_SHARED_CONTEXT.has(placement.kind)) excluded.add(SHARED_CONTEXT);
    return compilePattern(pattern, excluded);
  });
}

const COMPILED_BY_KIND: ReadonlyMap<string, readonly CompiledPattern[]> = new Map(
  PLACEMENTS.map((placement) => [placement.kind, compilePlacementPatterns(placement)] as const),
);

/** docs/ からの相対パスの第 1 階層が person・ai・client のどれか。それ以外 (docs/ 直下の文書を含む) は null */
export function roleOfPath(docsRelPath: string): Role | null {
  const [first, ...rest] = docsRelPath.split('/');
  if (rest.length === 0) return null;
  return ROLES.find((role) => role === first) ?? null;
}

/**
 * kind の置き場所のどれかに当たるか。context はフォルダ名から導いたまとまり (パターンの `<c>`、または
 * 階層の `shared`)。まとまりのフォルダを持たない場所 (要件・決定・提出物など) は null。
 */
export function matchPlacement(kind: string, docsRelPath: string): { ok: boolean; context: string | null } {
  for (const pattern of COMPILED_BY_KIND.get(kind) ?? []) {
    const matched = pattern.regex.exec(docsRelPath);
    if (matched === null) continue;
    return { ok: true, context: matched.groups?.['context'] ?? (pattern.hasSharedSegment ? SHARED_CONTEXT : null) };
  }
  return { ok: false, context: null };
}

/**
 * パスの型から kind を引く (frontmatter に kind が無い文書の既定。旧い構成の「ディレクトリの完全一致」に
 * 当たるもの)。複数の kind の型に当たるときは、ワイルドカードを除いた文字数が最も多い型 (最も具体的な型)
 * を取る。同じ具体さで kind が割れるとき (固定番号の文書で名前に kind が無いなど) は、パスだけでは決まらないので null。
 */
export function kindOfPath(docsRelPath: string): string | null {
  let best: { readonly kind: string; readonly literalLength: number } | null = null;
  let ambiguous = false;
  for (const placement of ROLE_OF_KIND.values()) {
    for (const pattern of COMPILED_BY_KIND.get(placement.kind) ?? []) {
      if (!pattern.regex.test(docsRelPath)) continue;
      if (best === null || pattern.literalLength > best.literalLength) {
        best = { kind: placement.kind, literalLength: pattern.literalLength };
        ambiguous = false;
      } else if (pattern.literalLength === best.literalLength && placement.kind !== best.kind) {
        ambiguous = true;
      }
    }
  }
  return best === null || ambiguous ? null : best.kind;
}

// ---------------------------------------------------------------------------
// 構成の検出
// ---------------------------------------------------------------------------

/**
 * v4 = person・ai・client のどれかがある (新しい構成。ADR-0002 の条件がすべて即違反になる)。
 * v3 = それが無く docs/common/ がある。それ以外 (docs/ が無い場合を含む) は legacy (旧い構成)。
 * docs/common/ と person・ai・client が併存する v3 の repo は v4 になる —— 版を上げた瞬間に新しい構成と判定され、
 * docs/common/ は違反として出る (ADR-0003)。v3 と legacy は、どちらも新しい構成の検査の対象外 (ADR-0005 決定 1)。
 */
export type Layout = 'v4' | 'legacy' | 'v3';

export function detectLayout(docsDirAbs: string): Layout {
  if (ROLES.some((role) => isDirectory(join(docsDirAbs, role)))) return 'v4';
  if (isDirectory(join(docsDirAbs, 'common'))) return 'v3';
  return 'legacy';
}

/** 生成索引: docs/ 直下の dependencies.md と、各フォルダの README.md。置き場所の表の外に置いてよい */
export function isGeneratedIndex(docsRelPath: string): boolean {
  return docsRelPath === 'dependencies.md' || docsRelPath === 'README.md' || docsRelPath.endsWith('/README.md');
}

// ---------------------------------------------------------------------------
// 1 フォルダの本数の上限 (ADR-0004 決定 2)
// ---------------------------------------------------------------------------

/** §7 の「15 本の対象外」。日付のある記録と提出物の章は、束で読まず 1 本ずつ承認するか 1 冊に束ねる */
export const FOLDER_SIZE_EXEMPT_DIRS: readonly string[] = [
  'person/decisions/<year>',
  'client/proposals/<year>',
  'client/delivery/<deliverable>',
];

const EXEMPT_DIR_PATTERNS: readonly CompiledPattern[] = FOLDER_SIZE_EXEMPT_DIRS.map((dir) => compilePattern(dir));

/** docs/ からの相対パスのフォルダが、本数の上限の対象外か */
export function isFolderSizeExempt(docsRelDir: string): boolean {
  return EXEMPT_DIR_PATTERNS.some((pattern) => pattern.regex.test(docsRelDir));
}
