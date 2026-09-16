#!/usr/bin/env node
// templates/ の雛形を apps/ へ展開する。
// 展開直後の module は dependency-cruiser のレイヤ規約を満たし、
// 生成される domain クラス名を図に貼れば check-domain-diagram-drift が緑になる。
//
// usage:
//   node scripts/scaffold-module.mjs --context booking --aggregate Reservation [--include-kernel]
//   node scripts/scaffold-module.mjs --kind web --feature booking
//   ... --dry-run で書き込まずに一覧だけ出す
//
// exit 0 = 展開成功 (dry-run 含む) / 1 = 既存ファイルと衝突・引数不正
// 既存ファイルは決して上書きしない。1 件でも衝突したら 1 ファイルも書かずに終了する。

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const EXIT_OK = 0;
const EXIT_FAIL = 1;

const CONTEXT_RE = /^[a-z][a-z0-9-]*$/;
const AGGREGATE_RE = /^[A-Z][A-Za-z0-9]*$/;
const PLACEHOLDER_RE =
  /__(context|Context|contextCamel|CONTEXT|aggregate|Aggregate|aggregateCamel|AGGREGATE|feature|Feature|featureCamel|timestamp)__/g;

function usage() {
  return [
    'usage:',
    '  node scripts/scaffold-module.mjs --context <kebab> --aggregate <Pascal> [--include-kernel] [--dry-run]',
    '  node scripts/scaffold-module.mjs --kind web --feature <kebab> [--dry-run]',
    '',
    '  --root <dir>       リポジトリルート (既定: このスクリプトの親ディレクトリ)',
    '  --include-kernel   初回のみ: templates/api-shared-kernel を apps/api へ展開する',
    '  --dry-run          書き込まずに展開先の一覧を出す',
  ].join('\n');
}

const toPascal = (kebab) =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
const toCamel = (pascal) => pascal.charAt(0).toLowerCase() + pascal.slice(1);
const toKebab = (pascal) =>
  pascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
const toConst = (pascal) => toKebab(pascal).replace(/-/g, '_').toUpperCase();

function parseArgs(argv) {
  const opts = {
    kind: 'api',
    context: null,
    aggregate: null,
    feature: null,
    root: REPO_ROOT,
    includeKernel: false,
    dryRun: false,
    now: new Date(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--include-kernel') opts.includeKernel = true;
    else if (arg === '--help' || arg === '-h') return { help: true };
    else if (['--kind', '--context', '--aggregate', '--feature', '--root'].includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} に値がありません` };
      const key = arg.slice(2);
      opts[key] = key === 'root' ? resolve(value) : value;
      i += 1;
    } else return { error: `不明な引数: ${arg}` };
  }

  if (opts.kind !== 'api' && opts.kind !== 'web') return { error: '--kind は api か web' };
  if (opts.kind === 'api') {
    if (!opts.context || !CONTEXT_RE.test(opts.context)) {
      return { error: '--context は kebab-case 必須 (例: booking)' };
    }
    if (!opts.aggregate || !AGGREGATE_RE.test(opts.aggregate)) {
      return { error: '--aggregate は PascalCase 必須 (例: Reservation)' };
    }
  } else if (!opts.feature || !CONTEXT_RE.test(opts.feature)) {
    return { error: '--feature は kebab-case 必須 (例: booking)' };
  }
  return { opts };
}

function timestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function buildReplacements(opts) {
  if (opts.kind === 'web') {
    return {
      feature: opts.feature,
      Feature: toPascal(opts.feature),
      featureCamel: toCamel(toPascal(opts.feature)),
    };
  }
  return {
    context: opts.context,
    Context: toPascal(opts.context),
    contextCamel: toCamel(toPascal(opts.context)),
    CONTEXT: opts.context.replace(/-/g, '_').toUpperCase(),
    aggregate: toKebab(opts.aggregate),
    Aggregate: opts.aggregate,
    aggregateCamel: toCamel(opts.aggregate),
    AGGREGATE: toConst(opts.aggregate),
    timestamp: timestamp(opts.now),
  };
}

function substitute(text, replacements) {
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const value = replacements[key];
    if (value === undefined) {
      throw new Error(`テンプレートのプレースホルダ ${match} に対応する値が無い`);
    }
    return value;
  });
}

function collectFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, base));
    else files.push(relative(base, full));
  }
  return files;
}

function plan(templateDir, destDir, replacements) {
  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    throw new Error(`テンプレートが無い: ${templateDir}`);
  }
  return collectFiles(templateDir).map((relPath) => ({
    from: join(templateDir, relPath),
    to: join(destDir, substitute(relPath, replacements)),
  }));
}

function run(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return EXIT_OK;
  }
  if (parsed.error) {
    process.stderr.write(`ERROR ${parsed.error}\n\n${usage()}\n`);
    return EXIT_FAIL;
  }
  const opts = parsed.opts;
  const replacements = buildReplacements(opts);
  const rel = (path) => relative(opts.root, path) || path;

  let entries;
  try {
    if (opts.kind === 'web') {
      entries = plan(join(opts.root, 'templates', 'web-feature'), join(opts.root, 'apps', 'web'), replacements);
    } else {
      entries = plan(join(opts.root, 'templates', 'api-module'), join(opts.root, 'apps', 'api'), replacements);
      if (opts.includeKernel) {
        entries = [
          ...plan(join(opts.root, 'templates', 'api-shared-kernel'), join(opts.root, 'apps', 'api'), replacements),
          ...entries,
        ];
      }
    }
  } catch (error) {
    process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_FAIL;
  }

  const conflicts = entries.filter((entry) => existsSync(entry.to));
  if (conflicts.length > 0) {
    for (const entry of conflicts) process.stderr.write(`CONFLICT ${rel(entry.to)} は既に存在する\n`);
    process.stderr.write(
      `\nERROR ${conflicts.length} 件が衝突。1 ファイルも書いていない。` +
        '意図的に作り直す場合は既存を削除してから再実行する。\n',
    );
    return EXIT_FAIL;
  }

  for (const entry of entries) {
    const content = substitute(readFileSync(entry.from, 'utf8'), replacements);
    if (!opts.dryRun) {
      mkdirSync(dirname(entry.to), { recursive: true });
      writeFileSync(entry.to, content);
    }
    process.stdout.write(`${opts.dryRun ? 'DRY  ' : 'WRITE'} ${rel(entry.to)}\n`);
  }

  if (opts.kind === 'api') {
    const { Aggregate } = replacements;
    process.stdout.write(
      [
        '',
        `NEXT  docs/design/detail/domain/${opts.context}.md に code_root: apps/api/src/modules/${opts.context}`,
        '      と下記 class 宣言を書く (書くまで check:domain-drift は DRIFT で落ちる):',
        `        class ${Aggregate}`,
        `        class ${Aggregate}Id`,
        `        class ${Aggregate}Status`,
        `        class ${Aggregate}CreatedEvent`,
        `        class ${Aggregate}RepositoryPort`,
        '',
      ].join('\n'),
    );
  }
  return EXIT_OK;
}

process.exit(run(process.argv.slice(2)));
