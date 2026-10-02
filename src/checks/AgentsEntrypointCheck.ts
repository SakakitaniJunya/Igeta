// AI の入口と、人の承認が要る側を承認する人に結びつける線の検査。
// Spec: docs/adr/0002-role-boundary-invariants.md 条件 15、ADR-0008 決定 1・3。
//
// 新しい構成 (docs/person・ai・client のどれかがある) の repo で、次を違反にする:
//   - repo 直下の AGENTS.md が無い、または docs/person/ と docs/ai/ の両方への言及が無い
//     (AI の入口は docs/ の外に置き、person/ を上流、ai/ を持ち場として指す。ADR-0001)
//   - .github/CODEOWNERS が無い。または、人の承認が要る側 (docs/person/ と docs/client/ の配下全体、門を決める
//     設定ファイル。CODEOWNERS_TARGETS) の代表のパスに、最後に当たる行が無い・その行にオーナーが無い
//     (CODEOWNERS は GitHub の規則どおり読む。core/Codeowners.ts: 後ろの行が勝ち、`docs/person/*` は直下の
//     ファイルにしか当たらない。`* @lead` や `/docs/ @lead` のような広い書き方で守っていてもよい)
// 旧い構成の repo では何も出さない。AGENTS.md の節の文面と、リンクの形式をどこまで見るかは、ここでは決めない
// (言及があるかだけを見る。ADR-0005 の「実装で決める論点」)。オーナーの書式 (@user・@org/team・メール) は見ない。

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Check, CheckContext } from '../core/Check.js';
import { lastMatchingEntry, parseCodeowners } from '../core/Codeowners.js';
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

/** CODEOWNERS が守る、人の承認が要る側の 1 まとまり */
export interface CodeownersTarget {
  /** 違反の文に出す名前 */
  readonly label: string;
  /** 代表のパス (repo 直下からの相対パス)。どれも、最後に当たる行にオーナーが 1 人以上要る */
  readonly paths: readonly string[];
  /** 配下全体を守る書き方の案内 (フォルダだけ) */
  readonly hint?: string;
}

const wholeFolder = (dir: string): string =>
  `配下全体に当たる書き方は ${dir}/・/${dir}/・${dir}/** で、${dir}/* は直下のファイルにしか当たらない`;

/**
 * 人の承認が要る側 (ADR-0008 決定 1 の表と決定 3)。フォルダは、配下の文書の代表のパスで見る: 置き場所の表
 * (core/Role.ts) の、要件・全体共通・まとまり・決定・提出物・提案書を 1 つずつ。`docs/person/design/` だけを
 * 守る行のような、一部のフォルダだけを守る書き方は、代表のパスのどれかに当たらず落ちる。設定ファイルは、
 * `.github/workflows/**` の代表として ci.yml を置く。
 */
export const CODEOWNERS_TARGETS: readonly CodeownersTarget[] = [
  {
    label: 'docs/person/ (配下全体)',
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
    paths: ['docs/client/delivery/x/01.md', 'docs/client/proposals/2026/01-proposal.md'],
    hint: wholeFolder('docs/client'),
  },
  { label: '.github/CODEOWNERS (自身)', paths: ['.github/CODEOWNERS'] },
  { label: '.github/workflows/ (配下全体)', paths: ['.github/workflows/ci.yml'] },
  { label: '.igeta.json', paths: ['.igeta.json'] },
  { label: 'AGENTS.md', paths: ['AGENTS.md'] },
  { label: 'package.json', paths: ['package.json'] },
];

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

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
          message: `${CODEOWNERS_FILE} が無い (人の承認が要る側 (docs/person/・docs/client/・設定ファイル) にオーナーを付ける行が要る)`,
          file: CODEOWNERS_FILE,
        },
      ];
    }
    const entries = parseCodeowners(readFileSync(path, 'utf8'));
    const violations: Violation[] = [];
    for (const target of CODEOWNERS_TARGETS) {
      // GitHub は、そのパスに最後に当たった行だけを使う。前の行にオーナーがあっても、後ろの行が外していれば無い
      const problems = target.paths.flatMap((targetPath): string[] => {
        const entry = lastMatchingEntry(entries, targetPath);
        if (entry === undefined) return [`${targetPath} に当たる行が無い`];
        if (entry.owners.length > 0) return [];
        return [`${targetPath} に最後に当たる ${entry.line} 行目 (${entry.pattern}) にオーナーが無い`];
      });
      if (problems.length === 0) continue;
      violations.push({
        severity: 'violation',
        message: `${CODEOWNERS_FILE} が ${target.label} を守っていない: ${problems.join(' / ')}${target.hint === undefined ? '' : ` (${target.hint})`}`,
        file: CODEOWNERS_FILE,
      });
    }
    return violations;
  }
}
