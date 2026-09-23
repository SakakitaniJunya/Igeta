// 公開リポジトリに社内情報を出さないための検査。対象リポジトリの全テキストファイルを
// 走査し、社内制約 ID / ローカル絶対パス / メールアドレス / トークン / 禁止語を検出する。
// 検出パターンそのものを書いてあるため、このファイルと自身のテストは走査対象外。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { Violation } from '../core/Report.js';

const SKIP_DIR = new Set(['.git', 'node_modules', 'dist', 'coverage']);

/** 自分自身。検出パターンをリテラルで持つので走査から外す。 */
const SELF_FILES = new Set([
  'src/checks/SecretScanCheck.ts',
  'src/checks/SecretScanCheck.test.ts',
]);

/** 値がテンプレートの穴埋めなら機密ではない。 */
const PLACEHOLDER_RE = /x{4,}|your|YOUR|example|EXAMPLE|placeholder/;

interface SecretPattern {
  readonly kind: string;
  readonly re: RegExp;
  /** 生値をメッセージに出さない (トークンは CI ログに残すと危険) */
  readonly redact: boolean;
  /** 一致しても機密でない値。機械が書く定型値を除くためだけに使う。 */
  readonly allow?: RegExp;
}

const PATTERNS: readonly SecretPattern[] = [
  // 社内制約 ID。SEC-001 / XC-101 のような別体系と衝突しないよう直前の英数字を除く。
  { kind: '社内制約 ID', re: /(?<![A-Za-z0-9_-])C-\d{3}(?!\d)/g, redact: false },
  { kind: 'ローカル絶対パス', re: /\/Users\/[A-Za-z0-9._@%+-]+(?:\/[A-Za-z0-9._@%+-]+)*/g, redact: false },
  {
    kind: 'メールアドレス',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    redact: false,
    // git+ssh://git@github.com/... のような VCS URL のユーザ部。lock ファイルに機械が書く値で、
    // 人のアドレスではない。これを機密扱いにすると init 直後の消費側が必ず赤になる。
    allow: /^(?:git|hg|svn)@/,
  },
  {
    kind: 'トークン',
    re: /(?<![A-Za-z0-9])(?:ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/g,
    redact: true,
  },
];

export interface SecretScanOptions {
  /** 追加の禁止語リスト (1 行 1 語、# 始まりはコメント)。未指定なら <targetRoot>/deny-list/names.txt を任意で読む */
  readonly denyListPath?: string;
}

function isPlaceholder(value: string, line: string): boolean {
  if (PLACEHOLDER_RE.test(value)) return true;
  return line.includes(`<${value}>`);
}

function redactValue(value: string): string {
  return `${value.slice(0, 8)}… (${value.length} 文字)`;
}

function parseDenyList(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function listFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR.has(entry.name)) continue;
        walk(path);
      } else if (entry.isFile()) {
        found.push(path);
      }
    }
  };
  walk(root);
  return found.sort();
}

export class SecretScanCheck implements Check {
  readonly name = 'secret-scan';

  readonly #denyListPath: string | undefined;

  constructor(options: SecretScanOptions = {}) {
    this.#denyListPath =
      options.denyListPath === undefined ? undefined : resolve(options.denyListPath);
  }

  run(ctx: CheckContext): readonly Violation[] {
    const root = ctx.targetRoot;
    const rel = (path: string): string => (relative(root, path) || path).split(sep).join('/');

    const explicitDenyList = this.#denyListPath !== undefined;
    const denyListPath = this.#denyListPath ?? join(root, 'deny-list', 'names.txt');
    if (explicitDenyList && !existsSync(denyListPath)) {
      return [
        {
          severity: 'cannot-check',
          file: rel(denyListPath),
          message: '禁止語リストが存在しない',
        },
      ];
    }
    const denyWords = existsSync(denyListPath)
      ? parseDenyList(readFileSync(denyListPath, 'utf8'))
      : [];
    // 禁止語リストは定義上すべての禁止語を含むので走査しない
    const denyListRel = rel(denyListPath);

    const violations: Violation[] = [];
    for (const path of listFiles(root)) {
      const relPath = rel(path);
      if (SELF_FILES.has(relPath) || relPath === denyListRel) continue;

      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch (error) {
        violations.push({
          severity: 'cannot-check',
          file: relPath,
          message: `読み取れない: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }
      if (text.includes('\u0000')) continue;

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line === undefined) continue;
        violations.push(...scanLine(line, i + 1, relPath, denyWords));
      }
    }
    return violations;
  }
}

function scanLine(
  line: string,
  lineNumber: number,
  file: string,
  denyWords: readonly string[],
): readonly Violation[] {
  const found: Violation[] = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let matched: RegExpExecArray | null = pattern.re.exec(line);
    while (matched !== null) {
      const value = matched[0];
      if (!isPlaceholder(value, line) && pattern.allow?.test(value) !== true) {
        found.push({
          severity: 'violation',
          file,
          line: lineNumber,
          message: `機密の疑い (${pattern.kind}): ${pattern.redact ? redactValue(value) : value}`,
        });
      }
      matched = pattern.re.exec(line);
    }
  }

  const haystack = line.toLowerCase();
  for (const word of denyWords) {
    const needle = word.toLowerCase();
    let from = haystack.indexOf(needle);
    while (from !== -1) {
      const value = line.slice(from, from + word.length);
      if (!isPlaceholder(value, line)) {
        found.push({
          severity: 'violation',
          file,
          line: lineNumber,
          message: `機密の疑い (禁止語): ${value}`,
        });
      }
      from = haystack.indexOf(needle, from + needle.length);
    }
  }
  return found;
}
