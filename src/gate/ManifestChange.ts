// package.json とロックファイルの変更のうち、門を動かすものだけを見分ける (ADR-0008 決定 1)。
// 他の依存だけが変わった package.json・lock は人の承認を要しない (`ai`)。
//
// - package.json: 前後で読んで比べる。`scripts` が変わった / `igeta` の依存 (別名で入れたものも) が変わった
// - ロックファイル: `igeta` の行 (その行と、その下にぶら下がる字下げの深い行) の組が変わった
//
// 比べるのは意味であって見た目ではない。キーの並び替えや字下げの整形だけの変更は変更とみなさない。

/** 依存を書く欄。`igeta` の版を決めうるものを全部見る (どれかに書き替えて外し替えても門が動く)。 */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

// `igeta` が名前として出てくる箇所 (`igeta-foo`・`eslint-plugin-igeta`・`my_igeta` は別の名前)。大文字小文字は問わない
// (git の依存は `.../Igeta.git#<sha>` と書く)。package.json の依存の項目と、ロックファイルの行の両方で使う
const IGETA_NAME = /(?<![A-Za-z0-9_-])igeta(?![A-Za-z0-9_-])/i;

export type PackageJsonChange = 'scripts' | 'igeta-dependency' | 'unreadable';

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function childOf(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

/** キーの順序に依らない文字列表現。undefined (キーが無い) は null (値が null) と区別する。 */
function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * 欄の項目のうち igeta に関わるもの (キーか指定に igeta の名前が出るもの)。別名 (`"igeta-old": "github:…/Igeta#v0.1.0"`)
 * で igeta の版を差し替えても拾う。
 */
function igetaEntries(section: unknown): JsonObject {
  if (!isObject(section)) return {};
  return Object.fromEntries(
    Object.entries(section).filter(([key, value]) => IGETA_NAME.test(key) || IGETA_NAME.test(canonical(value))),
  );
}

function igetaSpecs(manifest: JsonObject): string {
  const specs: Record<string, unknown> = {};
  for (const field of DEPENDENCY_FIELDS) specs[field] = igetaEntries(manifest[field]);
  // npm の overrides・yarn の resolutions・pnpm の overrides は、依存の欄に手を付けずに igeta の版を差し替えられる
  specs['overrides'] = igetaEntries(manifest['overrides']);
  specs['resolutions'] = igetaEntries(manifest['resolutions']);
  specs['pnpm.overrides'] = igetaEntries(childOf(manifest['pnpm'], 'overrides'));
  return canonical(specs);
}

/** null はファイルが無い (追加・削除の片側)。無いものは空のオブジェクトとして比べる。 */
function parseManifest(text: string | null): JsonObject | null {
  if (text === null) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * package.json の前後を比べ、門を動かす変更を返す。空配列は「他の欄だけの変更」(`ai`)。
 * どちらかが読めない (JSON が壊れている) ときは比べられないので `unreadable` を返す (`human` に倒す)。
 */
export function packageJsonGateChanges(before: string | null, after: string | null): readonly PackageJsonChange[] {
  const beforeManifest = parseManifest(before);
  const afterManifest = parseManifest(after);
  if (beforeManifest === null || afterManifest === null) return ['unreadable'];
  const changes: PackageJsonChange[] = [];
  if (canonical(beforeManifest['scripts']) !== canonical(afterManifest['scripts'])) changes.push('scripts');
  if (igetaSpecs(beforeManifest) !== igetaSpecs(afterManifest)) changes.push('igeta-dependency');
  return changes;
}

/** repo 直下のロックファイル (テキスト)。 */
export const TEXT_LOCKFILES: readonly string[] = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
];

/** repo 直下のロックファイル (バイナリ)。行を読めないので、変わったら igeta の行が変わったか見分けられない。 */
export const BINARY_LOCKFILES: readonly string[] = ['bun.lockb'];

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * ロックファイルのうち igeta に関わる行の組。igeta の名前が出る行ごとに、その行とその下の字下げの
 * 深い行 (JSON の `"node_modules/igeta": { ... }`・yarn.lock の `igeta@...:` の本体・pnpm の `igeta:` の下)
 * を 1 まとまりにして、並べ替えた配列にする。形式ごとの parser を持たずに 5 つのロックファイルを同じ
 * 規則で見る代わりに、igeta の名前が出る他の行の変更も拾う (見落とすより多く拾う側に倒す)。
 */
export function igetaLockBlocks(text: string | null): readonly string[] {
  if (text === null) return [];
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i];
    if (head === undefined || !IGETA_NAME.test(head)) continue;
    const indent = indentOf(head);
    const block = [head];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];
      if (next === undefined) break;
      if (next.trim() === '') continue;
      if (indentOf(next) <= indent) break;
      block.push(next);
    }
    blocks.push(block.join('\n'));
  }
  return blocks.sort();
}

/** ロックファイルの igeta の行が変わったか。 */
export function lockfileIgetaChanged(before: string | null, after: string | null): boolean {
  const a = igetaLockBlocks(before);
  const b = igetaLockBlocks(after);
  return a.length !== b.length || a.some((block, index) => block !== b[index]);
}
