#!/usr/bin/env node
/**
 * ソースの置き場の検査 (規約 MD-11)。1 フォルダの本体は 7 つまで、接頭辞を 3 つ以上共有したらフォルダにする、
 * utils のような置き場は作らない。spec (`*.spec.ts`・`*.test.ts`) は本体に数えない。
 * 使い方: `igeta-check-layout <dir>`。違反があれば一覧を出して終了コード 1 で終わる。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_BODY_FILES = 7;
export const MAX_SHARED_PREFIX = 2;
export const FORBIDDEN_FOLDER_NAMES = ['utils', 'util', 'helpers', 'helper', 'common', 'misc', 'shared'];

const SPEC_PATTERN = /\.(spec|test)\.tsx?$/;
const SOURCE_PATTERN = /\.tsx?$/;
const INDEX_PATTERN = /^index\.tsx?$/;

function prefixOf(fileName) {
  return fileName.replace(SOURCE_PATTERN, '').split(/[-.]/)[0];
}

function listBodyFiles(entries) {
  return entries
    .filter((entry) => entry.isFile() && SOURCE_PATTERN.test(entry.name) && !SPEC_PATTERN.test(entry.name))
    .map((entry) => entry.name);
}

function findPrefixViolations(folder, bodyFiles) {
  const groups = new Map();
  for (const fileName of bodyFiles.filter((name) => !INDEX_PATTERN.test(name))) {
    const prefix = prefixOf(fileName);
    groups.set(prefix, [...(groups.get(prefix) ?? []), fileName]);
  }

  return [...groups]
    .filter(([, fileNames]) => fileNames.length > MAX_SHARED_PREFIX)
    .map(([prefix, fileNames]) => `${folder}: 接頭辞 ${prefix} を ${fileNames.length} 本が共有している (${fileNames.join('・')})。フォルダにする`);
}

function findFolderViolations(folder, entries) {
  const bodyFiles = listBodyFiles(entries);
  const violations = findPrefixViolations(folder, bodyFiles);
  if (bodyFiles.length > MAX_BODY_FILES) {
    violations.push(`${folder}: 本体が ${bodyFiles.length} 本ある (上限 ${MAX_BODY_FILES})。まとまりごとにフォルダを分ける`);
  }
  for (const entry of entries.filter((item) => item.isDirectory() && FORBIDDEN_FOLDER_NAMES.includes(item.name))) {
    violations.push(`${path.join(folder, entry.name)}: ${entry.name} は作らない。役割の名前のフォルダにする`);
  }

  return violations;
}

/** root 以下を調べ、違反を文章の配列で返す。 */
export function findLayoutViolations(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const subfolders = entries.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules');
  const nested = subfolders.flatMap((entry) => findLayoutViolations(path.join(root, entry.name)));

  return [...findFolderViolations(root, entries), ...nested];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (root === undefined) {
    process.stderr.write('使い方: igeta-check-layout <dir>\n');
    process.exit(2);
  }
  const violations = findLayoutViolations(root);
  for (const violation of violations) process.stderr.write(`${violation}\n`);
  process.exit(violations.length === 0 ? 0 : 1);
}
