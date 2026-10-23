// 書き込みの前後で docs/ と書き換える文書を保存・復元する。失敗したら書く前の状態に戻す (record.ts が使う)。

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** repo 相対パス (`/` 区切り) → 内容 */
export type Snapshot = ReadonlyMap<string, Buffer>;

function listFiles(dir: string, root: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(full, root);
    return [relative(root, full).split('\\').join('/')];
  });
}

/** docs/ の全ファイルと、extra (docs/ の外の文書) の内容を保存する */
export function snapshotTree(root: string, extra: readonly string[]): Snapshot {
  const paths = new Set([...listFiles(join(root, 'docs'), root), ...extra]);
  return new Map([...paths].map((path) => [path, readFileSync(join(root, path))] as const));
}

/** 空のフォルダを下から消す (root 自体は残す) */
function pruneEmptyDirs(dir: string, keep: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name), keep);
  if (dir !== keep && readdirSync(dir).length === 0) rmdirSync(dir);
}

/** 保存した状態に戻す: 内容を書き戻し、docs/ に増えたファイルを消す */
export function restoreTree(root: string, snapshot: Snapshot): void {
  for (const path of listFiles(join(root, 'docs'), root)) if (!snapshot.has(path)) rmSync(join(root, path), { force: true });
  for (const [path, content] of snapshot) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const docs = join(root, 'docs');
  if (existsSync(docs)) pruneEmptyDirs(docs, docs);
}
