#!/usr/bin/env node
/**
 * ソースの置き場の検査 (規約 MD-11)。1 フォルダの本体は 7 つまで、接頭辞を 3 つ以上共有したらフォルダにする、
 * utils のような置き場は作らない。spec (`*.spec.ts`・`*.test.ts`) は本体に数えない。
 * `shared` だけは、`src` の直下にあり、直下の子が層と test-support (rust は test_support)、直下の本体が index.ts / mod.rs (rust) だけなら許す。
 * 引数の深さには依らない (`<変種>` を渡しても `<変種>/src` を渡しても同じ結果)。
 * 使い方: `igeta-check-layout <dir> [--ext rs]`。--ext は既定の ts・tsx に足す (繰り返しても `rs,ts` と書いても結合する)。違反があれば一覧を出して終了コード 1 で終わる。
 */
import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const MAX_BODY_FILES = 7;
export const MAX_SHARED_PREFIX = 2;
export const FORBIDDEN_FOLDER_NAMES = ['utils', 'util', 'helpers', 'helper', 'common', 'misc', 'shared'];
export const DEFAULT_EXTENSIONS = ['ts', 'tsx'];
const SHARED_FOLDER_NAME = 'shared';
/** 禁止名の中で唯一、`src` の直下で形が合えば許す名前 (横断の部品置き場) */
const SHARED_PARENT_NAME = 'src';
const SHARED_LAYERS = ['domain', 'application', 'infrastructure', 'presentation'];
const SUPPORTED_EXTENSIONS = [...DEFAULT_EXTENSIONS, 'rs'];

/** 言語ごとの判定。--ext に rs があれば rust の木、無ければ ts の木として、spec・index・shared の許可を出す。 */
function createKind(extensions) {
  const sourcePattern = new RegExp(`\\.(${extensions.join('|')})$`);
  const isRust = extensions.includes('rs');
  return {
    isSource: (name) => sourcePattern.test(name),
    isSpec: (name) => /\.(spec|test)\.tsx?$/.test(name) || /_test\.rs$/.test(name),
    isIndex: (name) => (isRust ? name === 'mod.rs' : /^index\.tsx?$/.test(name)),
    sharedFolders: [...SHARED_LAYERS, isRust ? 'test_support' : 'test-support'],
    sharedBodyFiles: isRust ? ['mod.rs'] : ['index.ts', 'index.tsx'],
    // rust の `__aggregate__.rs` は先頭の `_` を落としてから割る (落とさないと接頭辞が空になる)
    prefixOf: (name) =>
      name.endsWith('.rs')
        ? name.replace(sourcePattern, '').replace(/^_+/, '').split(/[-._]/)[0]
        : name.replace(sourcePattern, '').split(/[-.]/)[0],
  };
}

/** 1 フォルダぶんの走査の文脈。isJudgedShared は、src 直下の shared で、findSharedViolations が裁いた物。 */
function createScan({ kind, dir, isJudgedShared }) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return { kind, dir, entries, isJudgedShared, isSharedAllowed: path.basename(dir) === SHARED_PARENT_NAME };
}

function listBodyFiles(entries, kind) {
  return entries
    .filter((entry) => entry.isFile() && kind.isSource(entry.name) && !kind.isSpec(entry.name))
    .map((entry) => entry.name);
}

function findPrefixViolations({ dir, entries, kind }) {
  const groups = new Map();
  for (const fileName of listBodyFiles(entries, kind).filter((name) => !kind.isIndex(name))) {
    const prefix = kind.prefixOf(fileName);
    groups.set(prefix, [...(groups.get(prefix) ?? []), fileName]);
  }

  return [...groups]
    .filter(([, fileNames]) => fileNames.length > MAX_SHARED_PREFIX)
    .map(([prefix, fileNames]) => `${dir}: 接頭辞 ${prefix} を ${fileNames.length} 本が共有している (${fileNames.join('・')})。フォルダにする`);
}

/** shared は、直下の子が層と test-support だけで、直下の本体が index.ts / mod.rs だけのときに許す (L5)。 */
function findSharedViolations(sharedPath, kind) {
  const entries = readdirSync(sharedPath, { withFileTypes: true }).filter((entry) => entry.name !== 'node_modules');
  const strayFolders = entries.filter((entry) => entry.isDirectory() && !kind.sharedFolders.includes(entry.name));
  const strayFiles = listBodyFiles(entries, kind).filter((name) => !kind.sharedBodyFiles.includes(name));
  if (strayFolders.length === 0 && strayFiles.length === 0) return [];

  const strays = [...strayFolders.map((entry) => `${entry.name}/`), ...strayFiles].join('・');
  return [`${sharedPath}: shared の直下は ${kind.sharedFolders.join('・')} と ${kind.sharedBodyFiles.join('・')} だけ。置けない物: ${strays}`];
}

/** 禁止名の folder を数える。shared は src の直下にあるものだけ形を見て許し、それ以外は例外なしで落とす。 */
function findNamedFolderViolations({ dir, entries, kind, isSharedAllowed }) {
  const forbidden = entries.filter((item) => item.isDirectory() && FORBIDDEN_FOLDER_NAMES.includes(item.name));
  return forbidden.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.name === SHARED_FOLDER_NAME && isSharedAllowed) return findSharedViolations(entryPath, kind);
    return [`${entryPath}: ${entry.name} は作らない。役割の名前のフォルダにする`];
  });
}

function findFolderViolations(scan) {
  // src 直下の shared は findSharedViolations が本体も子も裁いたので、ここでは何も数えない
  if (scan.isJudgedShared) return [];

  const bodyCount = listBodyFiles(scan.entries, scan.kind).length;
  const tooMany =
    bodyCount > MAX_BODY_FILES ? [`${scan.dir}: 本体が ${bodyCount} 本ある (上限 ${MAX_BODY_FILES})。まとまりごとにフォルダを分ける`] : [];

  return [...findPrefixViolations(scan), ...tooMany, ...findNamedFolderViolations(scan)];
}

function walk({ kind, dir, isJudgedShared }) {
  const scan = createScan({ kind, dir, isJudgedShared });
  const subfolders = scan.entries.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules');
  const nested = subfolders.flatMap((entry) =>
    walk({ kind, dir: path.join(dir, entry.name), isJudgedShared: scan.isSharedAllowed && entry.name === SHARED_FOLDER_NAME }),
  );

  return [...findFolderViolations(scan), ...nested];
}

/** root 以下を調べ、違反を文章の配列で返す。extensions は既定の ts・tsx に足す拡張子 (rs だけ対応)。 */
export function findLayoutViolations(root, { extensions = [] } = {}) {
  const unsupported = extensions.filter((extension) => !SUPPORTED_EXTENSIONS.includes(extension));
  if (unsupported.length > 0) throw new Error(`--ext は ${SUPPORTED_EXTENSIONS.join(',')} のどれか: ${unsupported.join(',')}`);

  return walk({ kind: createKind([...new Set([...DEFAULT_EXTENSIONS, ...extensions])]), dir: root, isJudgedShared: false });
}

// bin のリンク経由で呼ばれても、本体と同じファイルとして扱う
if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const usage = '使い方: igeta-check-layout <dir> [--ext rs]';
  try {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: { ext: { type: 'string', multiple: true, default: [] } } });
    const [root, ...extras] = positionals;
    if (root === undefined) throw new Error('<dir> が無い');
    if (extras.length > 0) throw new Error(`余分な引数: ${extras.join(' ')} (拡張子は --ext rs)`);
    const extensions = values.ext.flatMap((value) => value.split(',')).filter((extension) => extension !== '');
    const violations = findLayoutViolations(root, { extensions });
    for (const violation of violations) process.stderr.write(`${violation}\n`);
    process.exit(violations.length === 0 ? 0 : 1);
  } catch (error) {
    // 引数の誤りは違反 (exit 1) と区別して exit 2
    process.stderr.write(`${String(error instanceof Error ? error.message : error).split('\n')[0]}。${usage}\n`);
    process.exit(2);
  }
}
