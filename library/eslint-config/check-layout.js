#!/usr/bin/env node
/**
 * ソースの置き場の検査 (規約 MD-11)。1 フォルダの本体は 7 つまで、接頭辞を 3 つ以上共有したらフォルダにする、
 * utils のような置き場は作らない。spec (`*.spec.ts`・`*.test.ts`) は本体に数えない。
 * `shared` だけは、直下の子が層と test-support (rust は test_support)、直下の本体が index.ts / mod.rs だけなら許す。
 * 使い方: `igeta-check-layout <dir> [--ext rs]`。--ext は既定の ts・tsx に足す。違反があれば一覧を出して終了コード 1 で終わる。
 */
import { readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const MAX_BODY_FILES = 7;
export const MAX_SHARED_PREFIX = 2;
export const FORBIDDEN_FOLDER_NAMES = ['utils', 'util', 'helpers', 'helper', 'common', 'misc', 'shared'];
export const DEFAULT_EXTENSIONS = ['ts', 'tsx'];
/** 禁止名の中で唯一、形が合えば許す名前 (横断の部品置き場) */
const SHARED_FOLDER_NAME = 'shared';
const SHARED_ALLOWED_FOLDERS = ['domain', 'application', 'infrastructure', 'presentation', 'test-support', 'test_support'];
const SHARED_ALLOWED_BODY_FILES = ['index.ts', 'index.tsx', 'mod.rs'];
const SUPPORTED_EXTENSIONS = [...DEFAULT_EXTENSIONS, 'rs'];

/** 拡張子ごとの判定。rs は `*_test.rs` を本体に数え、mod.rs を index と同じ扱いにし、接頭辞を `_` でも区切る。 */
function createKind(extensions) {
  const group = extensions.join('|');
  const isRust = (name) => name.endsWith('.rs');
  return {
    isSource: (name) => new RegExp(`\\.(${group})$`).test(name),
    isSpec: (name) => /\.(spec|test)\.tsx?$/.test(name) || /_test\.rs$/.test(name),
    isIndex: (name) => /^index\.tsx?$/.test(name) || name === 'mod.rs',
    prefixOf: (name) => name.replace(new RegExp(`\\.(${group})$`), '').split(isRust(name) ? /[-._]/ : /[-.]/)[0],
  };
}

function listBodyFiles(entries, kind) {
  return entries
    .filter((entry) => entry.isFile() && kind.isSource(entry.name) && !kind.isSpec(entry.name))
    .map((entry) => entry.name);
}

function findPrefixViolations(folder, bodyFiles, kind) {
  const groups = new Map();
  for (const fileName of bodyFiles.filter((name) => !kind.isIndex(name))) {
    const prefix = kind.prefixOf(fileName);
    groups.set(prefix, [...(groups.get(prefix) ?? []), fileName]);
  }

  return [...groups]
    .filter(([, fileNames]) => fileNames.length > MAX_SHARED_PREFIX)
    .map(([prefix, fileNames]) => `${folder}: 接頭辞 ${prefix} を ${fileNames.length} 本が共有している (${fileNames.join('・')})。フォルダにする`);
}

/** shared は、直下の子が層と test-support だけで、直下の本体が index.ts / mod.rs だけのときに許す (L5)。 */
function findSharedViolations(sharedPath, kind) {
  const entries = readdirSync(sharedPath, { withFileTypes: true }).filter((entry) => entry.name !== 'node_modules');
  const strayFolders = entries.filter((entry) => entry.isDirectory() && !SHARED_ALLOWED_FOLDERS.includes(entry.name));
  const strayFiles = listBodyFiles(entries, kind).filter((name) => !SHARED_ALLOWED_BODY_FILES.includes(name));
  if (strayFolders.length === 0 && strayFiles.length === 0) return [];

  const strays = [...strayFolders.map((entry) => `${entry.name}/`), ...strayFiles].join('・');
  return [`${sharedPath}: shared の直下は層 (${SHARED_ALLOWED_FOLDERS.join('・')}) と ${SHARED_ALLOWED_BODY_FILES.join('・')} だけ。置けない物: ${strays}`];
}

function findNamedFolderViolations(folder, entries, kind) {
  const forbidden = entries.filter((item) => item.isDirectory() && FORBIDDEN_FOLDER_NAMES.includes(item.name));
  return forbidden.flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.name === SHARED_FOLDER_NAME) return findSharedViolations(entryPath, kind);
    return [`${entryPath}: ${entry.name} は作らない。役割の名前のフォルダにする`];
  });
}

function findFolderViolations(folder, entries, kind) {
  const bodyFiles = listBodyFiles(entries, kind);
  const violations = findPrefixViolations(folder, bodyFiles, kind);
  if (bodyFiles.length > MAX_BODY_FILES) {
    violations.push(`${folder}: 本体が ${bodyFiles.length} 本ある (上限 ${MAX_BODY_FILES})。まとまりごとにフォルダを分ける`);
  }

  return [...violations, ...findNamedFolderViolations(folder, entries, kind)];
}

function walk(root, kind) {
  const entries = readdirSync(root, { withFileTypes: true });
  const subfolders = entries.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules');
  const nested = subfolders.flatMap((entry) => walk(path.join(root, entry.name), kind));

  return [...findFolderViolations(root, entries, kind), ...nested];
}

/** root 以下を調べ、違反を文章の配列で返す。extensions は既定の ts・tsx に足す拡張子 (rs だけ対応)。 */
export function findLayoutViolations(root, { extensions = [] } = {}) {
  const unsupported = extensions.filter((extension) => !SUPPORTED_EXTENSIONS.includes(extension));
  if (unsupported.length > 0) throw new Error(`--ext は ${SUPPORTED_EXTENSIONS.join(',')} のどれか: ${unsupported.join(',')}`);

  return walk(root, createKind([...new Set([...DEFAULT_EXTENSIONS, ...extensions])]));
}

// bin のリンク経由で呼ばれても、本体と同じファイルとして扱う
if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { ext: { type: 'string', default: '' } } });
  const [root] = positionals;
  if (root === undefined) {
    process.stderr.write('使い方: igeta-check-layout <dir> [--ext rs]\n');
    process.exit(2);
  }
  const extensions = values.ext.split(',').filter((extension) => extension !== '');
  const violations = findLayoutViolations(root, { extensions });
  for (const violation of violations) process.stderr.write(`${violation}\n`);
  process.exit(violations.length === 0 ? 0 : 1);
}
