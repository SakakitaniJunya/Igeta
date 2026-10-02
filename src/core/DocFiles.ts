// docs/ 配下の Markdown を列挙する。新しい構成の検査 (RoleBoundaryCheck・FolderSizeCheck) と
// 構成の検出 (Role.ts) が同じ数え方をするよう、ここに 1 か所だけ持つ。

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

// docs/ の中に npm の依存 (ドキュメントサイトなど) が入っていても、そこの Markdown は文書ではない
const SKIP_DIR = new Set(['node_modules']);

/**
 * docs/ 配下の `.md` を、docs/ からの相対パス (区切りは `/`) で返す。README.md も含む —— 生成索引かどうかは
 * 呼び出し側が isGeneratedIndex (Role.ts) で見分ける。node_modules と点で始まるフォルダは辿らない。
 */
export function listDocFiles(docsDirAbs: string): readonly string[] {
  const found: string[] = [];
  const walk = (dirAbs: string, prefix: string): void => {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(dirAbs, entry.name), rel);
      } else if (entry.name.endsWith('.md')) {
        found.push(rel);
      }
    }
  };
  walk(docsDirAbs, '');
  return found.sort();
}
