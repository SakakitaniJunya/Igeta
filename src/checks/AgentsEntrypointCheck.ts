// AI の入口の検査。
// Spec: docs/adr/0002-role-boundary-invariants.md 条件 15、ADR-0008 決定 3。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo で、次を違反にする:
//   - repo 直下の AGENTS.md が無い、または docs/person/ と docs/ai/ の両方への言及が無い
//     (AI の入口は docs/ の外に置き、person/ を上流、ai/ を持ち場として指す。ADR-0001)
//   - .github/CODEOWNERS に、docs/person/ と docs/client/ の行が無い (人の承認が要る側を、
//     承認する人に結びつける。行は、そのフォルダを指すパターンと、オーナー 1 人以上を持つこと)
// 旧い構成の repo では何も出さない。AGENTS.md の節の文面と、リンクの形式をどこまで見るかは、ここでは決めない
// (言及があるかだけを見る。ADR-0005 の「実装で決める論点」)。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { isDirectory } from '../core/DocFiles.js';
import type { Violation } from '../core/Report.js';
import { detectLayout } from '../core/Role.js';

const AGENTS_FILE = 'AGENTS.md';
const CODEOWNERS_FILE = '.github/CODEOWNERS';

/** AGENTS.md が指すべきフォルダ。名前の続き (docs/personal・mydocs/person など) は数えない */
const AGENTS_MENTIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ['docs/person/', /(?<![\w-])docs\/person(?![\w-])/],
  ['docs/ai/', /(?<![\w-])docs\/ai(?![\w-])/],
];

/** CODEOWNERS に行が要るフォルダ (人の承認が要る側。ADR-0008) */
const CODEOWNERS_DIRS: readonly string[] = ['docs/person', 'docs/client'];

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/** CODEOWNERS のパターンが指すフォルダ。`/docs/person/`・`docs/person/**`・`docs/person` を同じものとして扱う */
const patternTarget = (pattern: string): string =>
  pattern.replace(/^\//, '').replace(/(?:\/\*{1,2})?\/?$/, '');

/** コメントと空行を除いた各行の、パターンとオーナーの数 */
function parseCodeowners(text: string): ReadonlyArray<{ readonly target: string; readonly owners: number }> {
  const entries: { readonly target: string; readonly owners: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [pattern, ...owners] = raw.replace(/\s+#.*$/, '').trim().split(/\s+/);
    if (pattern === undefined || pattern === '' || pattern.startsWith('#')) continue;
    entries.push({ target: patternTarget(pattern), owners: owners.filter((owner) => owner !== '').length });
  }
  return entries;
}

export class AgentsEntrypointCheck implements Check {
  readonly name = 'agents-entrypoint-check';

  run(ctx: CheckContext): readonly Violation[] {
    const docsDir = join(ctx.targetRoot, 'docs');
    if (!isDirectory(docsDir)) {
      return [{ severity: 'cannot-check', message: `docs が無い: ${relative(ctx.targetRoot, docsDir)}` }];
    }
    if (detectLayout(docsDir) === 'legacy') return [];
    return [...this.#checkAgents(ctx.targetRoot), ...this.#checkCodeowners(ctx.targetRoot)];
  }

  #checkAgents(targetRoot: string): readonly Violation[] {
    const path = join(targetRoot, AGENTS_FILE);
    if (!isFile(path)) {
      return [
        {
          severity: 'violation',
          message: 'repo 直下に AGENTS.md が無い (AI の入口。docs/person/ を上流、docs/ai/ を持ち場として指す)',
          file: AGENTS_FILE,
        },
      ];
    }
    const text = readFileSync(path, 'utf8');
    return AGENTS_MENTIONS.filter(([, pattern]) => !pattern.test(text)).map(([label]) => ({
      severity: 'violation',
      message: `AGENTS.md が ${label} に触れていない (AI の入口として、docs/person/ と docs/ai/ の両方を指す)`,
      file: AGENTS_FILE,
    }));
  }

  #checkCodeowners(targetRoot: string): readonly Violation[] {
    const path = join(targetRoot, CODEOWNERS_FILE);
    if (!isFile(path)) {
      return [
        {
          severity: 'violation',
          message: `${CODEOWNERS_FILE} が無い (${CODEOWNERS_DIRS.map((dir) => `${dir}/`).join(' と ')} の行が要る)`,
          file: CODEOWNERS_FILE,
        },
      ];
    }
    const entries = parseCodeowners(readFileSync(path, 'utf8'));
    return CODEOWNERS_DIRS.filter((dir) => !entries.some((entry) => entry.target === dir && entry.owners > 0)).map(
      (dir) => ({
        severity: 'violation',
        message: `${CODEOWNERS_FILE} に ${dir}/ の行が無い (行にはオーナーが 1 人以上要る。人の承認が要る側を承認する人に結びつける)`,
        file: CODEOWNERS_FILE,
      }),
    );
  }
}
