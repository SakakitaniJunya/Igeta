// AI の入口と、人の承認が要るパスを承認する人に結びつける線の検査。
// Spec: docs/adr/0002-role-boundary-invariants.md 条件 15、ADR-0008 決定 1、
//       docs/design/test/specs/06-init-scaffold.md の I14。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo で、次を違反にする:
//   - repo 直下の AGENTS.md が無い、または docs/person/ と docs/ai/ の両方への言及が無い
//     (AI の入口は docs/ の外に置き、person/ を上流、ai/ を持ち場として指す。ADR-0001)
//   - .github/CODEOWNERS が無い。または、ADR-0008 決定 1 のパス (CODEOWNERS_TARGETS の代表のパス) と、`.igeta.json` の
//     humanPaths に当たる「いまあるファイル」に、最後に当たる行が無い・その行にオーナーが無い
//     (CODEOWNERS は GitHub の規則どおり読む。core/Codeowners.ts: 後ろの行が勝ち、`docs/person/*` は直下の
//     ファイルにしか当たらない。`* @lead` や `/docs/ @lead` のような広い書き方で守っていてもよい)
// 旧い構成の repo では何も出さない。AGENTS.md の節の文面と、リンクの形式をどこまで見るかは、ここでは決めない
// (言及があるかだけを見る。ADR-0005 の「実装で決める論点」)。オーナーの書式 (@user・@org/team・メール) は見ない。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import type { CodeownersEntry } from '../core/Codeowners.js';
import { lastMatchingEntry, parseCodeowners } from '../core/Codeowners.js';
import { isDirectory } from '../core/DocFiles.js';
import { loadIgetaConfig } from '../core/IgetaConfig.js';
import type { Violation } from '../core/Report.js';
import { detectLayout } from '../core/Role.js';
import { matchesGlob } from '../gate/PathGlob.js';

const AGENTS_FILE = 'AGENTS.md';
const CODEOWNERS_FILE = '.github/CODEOWNERS';

/** AGENTS.md が指すべきフォルダ。名前の続き (docs/personal・mydocs/person など) は数えない */
const AGENTS_MENTIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ['docs/person/', /(?<![\w-])docs\/person(?![\w-])/],
  ['docs/ai/', /(?<![\w-])docs\/ai(?![\w-])/],
];

/** AGENTS.md の本文が触れていない、指すべきフォルダ (空なら両方に触れている)。承認の割り当てを置く側 (init) も同じ見方をする */
export function missingAgentsMentions(text: string): readonly string[] {
  return AGENTS_MENTIONS.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

/** CODEOWNERS が守る、人の承認が要る側の 1 まとまり (ADR-0008 決定 1 の表の 1 行) */
export interface CodeownersTarget {
  /** 違反の文に出す名前 */
  readonly label: string;
  /** CODEOWNERS に書く行のパターン。`init`・`docs-migrate` が足りないときに置く行と同じ (承認の割り当ての作り手が使う) */
  readonly pattern: string;
  /** 代表のパス (repo 直下からの相対パス)。どれも、最後に当たる行にオーナーが 1 人以上要る */
  readonly paths: readonly string[];
  /** 配下全体を守る書き方の案内 (フォルダだけ) */
  readonly hint?: string;
}

const wholeFolder = (dir: string): string =>
  `配下全体に当たる書き方は ${dir}/・/${dir}/・${dir}/** で、${dir}/* は直下のファイルにしか当たらない`;

/**
 * 人の承認が要るパス (ADR-0008 決定 1 の表。パスの見分けの正本は gate/ApprovalScope.ts の pathRule)。順は、`init` が
 * CODEOWNERS に置く行の順。フォルダは、配下の文書の代表のパスで見る: `docs/person/` は置き場所の表 (core/Role.ts) の、
 * 要件・全体共通・まとまり・決定を 1 つずつ、`docs/client/` は提出物・提案書。一部のフォルダだけを守る書き方
 * (`docs/person/design/` だけを守る行など) は、代表のパスのどれかに当たらず落ちる。`.github/` は、直下の CODEOWNERS と、
 * 下のフォルダ (workflows・actions)。AGENTS.md はどの階層にも当たる名前なので、下位の docs/ai/AGENTS.md も見る。
 */
export const CODEOWNERS_TARGETS: readonly CodeownersTarget[] = [
  {
    label: 'docs/person/ (配下全体)',
    pattern: '/docs/person/',
    paths: [
      'docs/person/requirements/01-requirements.md',
      'docs/person/design/shared/00-map.md',
      'docs/person/design/reservation/flows/01-booking.md',
      'docs/person/decisions/2026/0001-x.md',
    ],
    hint: wholeFolder('docs/person'),
  },
  {
    label: 'docs/client/ (配下全体)',
    pattern: '/docs/client/',
    paths: ['docs/client/delivery/x/01.md', 'docs/client/proposals/2026/01-proposal.md'],
    hint: wholeFolder('docs/client'),
  },
  {
    label: '.github/ (配下全体)',
    pattern: '/.github/',
    paths: ['.github/CODEOWNERS', '.github/workflows/ci.yml', '.github/actions/a/action.yml'],
    hint: wholeFolder('.github'),
  },
  { label: 'CODEOWNERS (repo 直下)', pattern: '/CODEOWNERS', paths: ['CODEOWNERS'] },
  { label: 'docs/CODEOWNERS', pattern: '/docs/CODEOWNERS', paths: ['docs/CODEOWNERS'] },
  { label: '.igeta.json', pattern: '/.igeta.json', paths: ['.igeta.json'] },
  { label: '.igeta-version', pattern: '/.igeta-version', paths: ['.igeta-version'] },
  { label: '.claude/ (配下全体)', pattern: '/.claude/', paths: ['.claude/settings.json'], hint: wholeFolder('.claude') },
  { label: 'AGENTS.md (どの階層)', pattern: 'AGENTS.md', paths: ['AGENTS.md', 'docs/ai/AGENTS.md'] },
  { label: 'CLAUDE.md', pattern: 'CLAUDE.md', paths: ['CLAUDE.md'] },
];

/**
 * パスのうち、最後に当たる行にオーナーが無いものの説明 (空なら、全部のパスにオーナーが付く)。
 * GitHub は、そのパスに最後に当たった行だけを使う。前の行にオーナーがあっても、後ろの行が外していれば無い。
 * 承認の割り当てを置く側 (init) が、足りない行の判定と、足した後に残る穴の判定に同じ見方を使う。
 */
export function codeownersProblems(entries: readonly CodeownersEntry[], paths: readonly string[]): readonly string[] {
  return paths.flatMap((path): string[] => {
    const entry = lastMatchingEntry(entries, path);
    if (entry === undefined) return [`${path} に当たる行が無い`];
    if (entry.owners.length > 0) return [];
    return [`${path} に最後に当たる ${entry.line} 行目 (${entry.pattern}) にオーナーが無い`];
  });
}

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/** humanPaths に当たるファイルを探すときに辿らないフォルダ (git の中身と、npm の依存) */
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules']);

/** repo の中の、いまあるファイル (repo 直下からの相対パス。区切りは `/`。パスの文字コード順) */
function listRepoFiles(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (!entry.isDirectory()) found.push(rel);
      else if (!SKIPPED_DIRS.has(entry.name)) walk(join(dir, entry.name), rel);
    }
  };
  walk(root, '');
  return found.sort();
}

/** 違反の文に並べるパスの数。それ以上は件数にまとめる */
const SHOWN_PROBLEMS = 5;

export class AgentsEntrypointCheck implements Check {
  readonly name = 'agents-entrypoint-check';

  run(ctx: CheckContext): readonly Violation[] {
    const docsDir = join(ctx.targetRoot, 'docs');
    if (!isDirectory(docsDir)) {
      return [{ severity: 'cannot-check', message: `docs が無い: ${relative(ctx.targetRoot, docsDir)}` }];
    }
    if (detectLayout(docsDir) !== 'v4') return [];
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
    return missingAgentsMentions(readFileSync(path, 'utf8')).map((label) => ({
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
          message: `${CODEOWNERS_FILE} が無い (人の承認が要るパス (ADR-0008 決定 1) にオーナーを付ける行が要る)`,
          file: CODEOWNERS_FILE,
        },
      ];
    }
    const entries = parseCodeowners(readFileSync(path, 'utf8'));
    const violations: Violation[] = [];
    for (const target of CODEOWNERS_TARGETS) {
      const problems = codeownersProblems(entries, target.paths);
      if (problems.length === 0) continue;
      violations.push({
        severity: 'violation',
        message: `${CODEOWNERS_FILE} が ${target.label} を守っていない: ${problems.join(' / ')}${target.hint === undefined ? '' : ` (${target.hint})`}`,
        file: CODEOWNERS_FILE,
      });
    }
    return [...violations, ...this.#checkHumanPaths(targetRoot, entries)];
  }

  /** `.igeta.json` の humanPaths に当たる、いまあるファイルにもオーナーが付くこと (glob は CODEOWNERS の書き方に写せないので、ファイルで見る) */
  #checkHumanPaths(targetRoot: string, entries: readonly CodeownersEntry[]): readonly Violation[] {
    const loaded = loadIgetaConfig(targetRoot);
    if ('violation' in loaded) return [loaded.violation];
    const { humanPaths } = loaded.config;
    if (humanPaths.length === 0) return [];

    const files = listRepoFiles(targetRoot);
    const violations: Violation[] = [];
    for (const glob of humanPaths) {
      const problems = codeownersProblems(entries, files.filter((file) => matchesGlob(file, glob)));
      if (problems.length === 0) continue;
      const rest = problems.length > SHOWN_PROBLEMS ? ` / ほか ${problems.length - SHOWN_PROBLEMS} 件` : '';
      violations.push({
        severity: 'violation',
        message: `${CODEOWNERS_FILE} が humanPaths の ${glob} を守っていない (いまあるファイル): ${problems.slice(0, SHOWN_PROBLEMS).join(' / ')}${rest}`,
        file: CODEOWNERS_FILE,
      });
    }
    return violations;
  }
}
