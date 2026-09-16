#!/usr/bin/env node
// docs/design/detail/domain/*.md の mermaid classDiagram と
// <code_root>/domain 配下の TypeScript export を双方向で照合する。
// 契約の正典は docs/adr/0003-modular-monolith-and-diagram-code-contract.md。
//
// exit 0 = 一致 / 1 = ドリフト検出 / 2 = 検査不能 (設定不備・code_root 欠落)
// 「未実装だから緑」は作らない (原則: サイレント縮退禁止)。実装が無い状態で
// 図だけを検証したい場合は --allow-missing-code を明示的に渡す。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_OK = 0;
const EXIT_DRIFT = 1;
const EXIT_CANNOT_CHECK = 2;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const MERMAID_OPEN_RE = /^\s*```+\s*mermaid\s*$/;
const FENCE_CLOSE_RE = /^\s*```+\s*$/;
const CLASS_DIAGRAM_RE = /^classDiagram(-v2)?\b/;
// mermaid: class Foo / class Foo~T~ / class Foo["ラベル"] / class Foo:::style / class Foo {
const CLASS_DECL_RE =
  /^\s*class\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:~[^~]*~)?\s*(?:\[[^\]]*\])?\s*(?::::[A-Za-z0-9_-]+)?\s*\{?\s*$/;
// TypeScript: export class / export abstract class / export interface / export type X =
const EXPORT_DECL_RE =
  /^\s*export\s+(?:declare\s+)?(abstract class|class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

const SKIP_FILE_RE = /(\.spec\.ts|\.test\.ts|\.d\.ts)$/;
const SKIP_DIR = new Set(['node_modules', '__tests__', '__mocks__', 'dist', 'coverage']);

function usage() {
  return [
    'usage: node scripts/check-domain-diagram-drift.mjs [options]',
    '',
    '  --allow-missing-code   code_root が未実装のときに図側のみ検証して exit 0',
    '  --root <dir>           リポジトリルート (既定: このスクリプトの親ディレクトリ)',
    '  --docs <dir>           図のディレクトリ (既定: <root>/docs/design/detail/domain)',
    '  -h, --help             このヘルプ',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { root: REPO_ROOT, docs: null, allowMissingCode: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--allow-missing-code') {
      opts.allowMissingCode = true;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else if (arg === '--root' || arg === '--docs') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: `${arg} に値がありません` };
      }
      if (arg === '--root') opts.root = resolve(value);
      else opts.docs = resolve(value);
      i += 1;
    } else {
      return { error: `不明な引数: ${arg}` };
    }
  }
  if (opts.docs === null) opts.docs = join(opts.root, 'docs', 'design', 'detail', 'domain');
  return { opts };
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

function listMarkdown(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(dir, name));
}

function listTypeScript(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(join(current, entry.name));
      } else if (entry.name.endsWith('.ts') && !SKIP_FILE_RE.test(entry.name)) {
        found.push(join(current, entry.name));
      }
    }
  };
  walk(dir);
  return found;
}

function parseFrontmatter(lines) {
  if (lines.length === 0 || lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const data = {};
  for (let i = 1; i < end; i += 1) {
    const matched = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[i]);
    if (matched) data[matched[1]] = matched[2].trim().replace(/^["']|["']$/g, '');
  }
  return data;
}

// mermaid classDiagram ブロックの class 宣言を { name, line } で返す。
function extractDiagramClasses(lines) {
  const declarations = [];
  let blocks = 0;
  let inFence = false;
  let isClassDiagram = false;
  let sawDirective = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inFence) {
      if (MERMAID_OPEN_RE.test(line)) {
        inFence = true;
        isClassDiagram = false;
        sawDirective = false;
      }
      continue;
    }
    if (FENCE_CLOSE_RE.test(line)) {
      inFence = false;
      continue;
    }
    const body = line.trim();
    if (body === '' || body.startsWith('%%')) continue;
    if (!sawDirective) {
      sawDirective = true;
      isClassDiagram = CLASS_DIAGRAM_RE.test(body);
      if (isClassDiagram) blocks += 1;
      continue;
    }
    if (!isClassDiagram) continue;
    const matched = CLASS_DECL_RE.exec(line);
    if (matched) declarations.push({ name: matched[1], line: i + 1 });
  }
  return { declarations, blocks, unterminated: inFence };
}

function extractExportedTypes(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const found = [];
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    const matched = EXPORT_DECL_RE.exec(line);
    if (matched) found.push({ name: matched[2], kind: matched[1], file, line: i + 1 });
  }
  return found;
}

function run(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return EXIT_OK;
  }
  if (parsed.error) {
    process.stderr.write(`CONFIG ${parsed.error}\n\n${usage()}\n`);
    return EXIT_CANNOT_CHECK;
  }
  const { root, docs, allowMissingCode } = parsed.opts;
  const rel = (path) => relative(root, path) || path;

  const configErrors = [];
  const driftErrors = [];
  const notes = [];

  if (!isDirectory(docs)) {
    process.stderr.write(
      `CONFIG 図ディレクトリが存在しない: ${rel(docs)}\n` +
        '  ドメイン図は図↔実装の契約上必須です。未作成なら作成してください (skip はしません)。\n',
    );
    return EXIT_CANNOT_CHECK;
  }

  const markdownFiles = listMarkdown(docs).filter(
    (file) => !file.endsWith('README.md') && !file.endsWith('index.md'),
  );
  if (markdownFiles.length === 0) {
    process.stderr.write(`CONFIG 図が 1 枚も無い: ${rel(docs)}\n`);
    return EXIT_CANNOT_CHECK;
  }

  // code_root ごとに図側の宣言を束ねる (1 コンテキストを複数ファイルに分割してよい)
  const byCodeRoot = new Map();
  const skipped = [];
  for (const file of markdownFiles) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const frontmatter = parseFrontmatter(lines);
    if (frontmatter === null) {
      configErrors.push(`${rel(file)}:1 frontmatter が無い (--- で囲む)`);
      continue;
    }
    // 同じディレクトリには総論 (kind: domain-overview) や集約マップも置かれる。
    // kind が別種の文書は照合対象外。kind 未設定の場合は対象として扱い、
    // code_root / classDiagram の欠落を CONFIG で落とす (無言スキップを作らない)。
    if (frontmatter.kind && frontmatter.kind !== 'domain-model') {
      skipped.push(`${rel(file)} (kind: ${frontmatter.kind})`);
      continue;
    }
    const codeRoot = frontmatter.code_root;
    if (!codeRoot) {
      configErrors.push(
        `${rel(file)}:1 frontmatter に code_root が無い ` +
          '(例: code_root: apps/api/src/modules/booking)',
      );
      continue;
    }
    const { declarations, blocks, unterminated } = extractDiagramClasses(lines);
    if (unterminated) {
      configErrors.push(`${rel(file)} mermaid コードフェンスが閉じていない`);
      continue;
    }
    if (blocks === 0) {
      configErrors.push(`${rel(file)} mermaid classDiagram ブロックが無い`);
      continue;
    }
    if (declarations.length === 0) {
      configErrors.push(`${rel(file)} classDiagram に class 宣言が 1 つも無い`);
      continue;
    }
    const bucket = byCodeRoot.get(codeRoot) ?? new Map();
    for (const decl of declarations) {
      const existing = bucket.get(decl.name);
      if (existing) {
        configErrors.push(
          `${rel(file)}:${decl.line} クラス名の重複宣言: ${decl.name} ` +
            `(既出 ${rel(existing.file)}:${existing.line})`,
        );
        continue;
      }
      bucket.set(decl.name, { file, line: decl.line });
    }
    byCodeRoot.set(codeRoot, bucket);
  }

  if (configErrors.length > 0) {
    for (const message of configErrors) process.stderr.write(`CONFIG ${message}\n`);
    return EXIT_CANNOT_CHECK;
  }

  let checkedRoots = 0;
  for (const [codeRoot, diagramClasses] of [...byCodeRoot.entries()].sort()) {
    const domainDir = resolve(root, codeRoot, 'domain');
    if (!isDirectory(domainDir)) {
      if (!allowMissingCode) {
        process.stderr.write(
          `CONFIG 実装が無い: ${rel(domainDir)}\n` +
            '  実装前に図だけを検証するなら --allow-missing-code を明示してください。\n',
        );
        return EXIT_CANNOT_CHECK;
      }
      notes.push(`SKIP  ${rel(domainDir)} 未実装 (--allow-missing-code)`);
      continue;
    }
    checkedRoots += 1;

    const exported = new Map();
    for (const file of listTypeScript(domainDir)) {
      for (const decl of extractExportedTypes(file)) {
        if (!exported.has(decl.name)) exported.set(decl.name, decl);
      }
    }

    for (const [name, where] of diagramClasses) {
      if (!exported.has(name)) {
        driftErrors.push(
          `${rel(where.file)}:${where.line} 図にあるが実装に無い: ${name} ` +
            `(期待: ${rel(domainDir)} に export class|interface|type ${name})`,
        );
      }
    }
    for (const [name, decl] of exported) {
      if (!diagramClasses.has(name)) {
        driftErrors.push(
          `${rel(decl.file)}:${decl.line} 実装にあるが図に無い: ${name} (${decl.kind}) ` +
            `(期待: code_root: ${codeRoot} の図に class ${name})`,
        );
      }
    }
  }

  for (const path of skipped) process.stdout.write(`SKIP  ${path} 図ではない文書\n`);
  for (const note of notes) process.stdout.write(`${note}\n`);
  if (driftErrors.length > 0) {
    for (const message of driftErrors.sort()) process.stderr.write(`DRIFT ${message}\n`);
    process.stderr.write(`\nDRIFT ${driftErrors.length} 件。図か実装のどちらかを直してください。\n`);
    return EXIT_DRIFT;
  }
  process.stdout.write(
    `OK    図 ${markdownFiles.length - skipped.length} 枚 / code_root ${byCodeRoot.size} 件` +
      ` (実装照合 ${checkedRoots} 件, 未実装 ${notes.length} 件)\n`,
  );
  return EXIT_OK;
}

process.exit(run(process.argv.slice(2)));
