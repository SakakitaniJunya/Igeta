// 承認の割り当てのファイル (`AGENTS.md` と `.github/CODEOWNERS`) の作り手。`init` と `docs-migrate` が、同じこの作り手で置く。
// Spec: docs/design/test/specs/06-init-scaffold.md の I5・I8・I9、docs/adr/0008-human-approval-scope.md 決定 1・5・7。
//
// 何も書かず、書く内容 (書いた後のファイルの全文) を返す。ほかのファイルの衝突と合わせて、書くか止めるかは呼び出し側が決める。
//   AGENTS.md        無ければ雛形から作る。あって docs/person・docs/ai に触れていなければ、入口の節 (雛形の節) を末尾に足す
//   .github/CODEOWNERS  無ければ、ADR-0008 決定 1 のパス (AgentsEntrypointCheck の CODEOWNERS_TARGETS) の行で作る。
//                    あれば、持ち主が付かないパスの行だけを先頭に足す (後ろの行が勝つので、既にある割り当ては変わらない)。
//                    足した後も持ち主が付かないパスが残るとき、repo 直下か docs/ に CODEOWNERS があるときは、止める
//                    (`.github/` に作ると、GitHub はそちらだけを読み、既にあるファイルが読まれなくなる)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CODEOWNERS_TARGETS, codeownersProblems, listRepoFiles, missingAgentsMentions } from '../checks/AgentsEntrypointCheck.js';
import { parseCodeowners } from '../core/Codeowners.js';
import { matchesGlob } from '../gate/PathGlob.js';

const AGENTS_FILE = 'AGENTS.md';
const CODEOWNERS_FILE = '.github/CODEOWNERS';
/** GitHub が CODEOWNERS を読む、`.github/` 以外の 2 か所 */
const OTHER_CODEOWNERS_FILES: readonly string[] = ['CODEOWNERS', 'docs/CODEOWNERS'];

/** 持ち主の形 (I5): `@user`・`@org/team`・メールアドレス。空白・改行・`#` を含まない (CODEOWNERS の 1 行にそのまま書ける) */
const OWNER_FORMS: readonly RegExp[] = [
  /^@[A-Za-z0-9][A-Za-z0-9-]*$/,
  /^@[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
];

export const isOwnerForm = (owner: string): boolean => OWNER_FORMS.some((form) => form.test(owner));

/** Igeta の手引きの置き場所。利用 repo の docs/ には写さず、AGENTS.md から版に固定した手引きを指す (ADR-0005 決定 4) */
const HANDBOOK_DIR = 'node_modules/igeta/templates/docs/ai/handbook/how-to/';

/** AGENTS.md の雛形の節 (I9)。入口の節として、あるファイルの末尾にも足す */
const AGENTS_SECTIONS: string = [
  '## 読む順',
  '',
  '1. `docs/person/` が上流。人が決めた決まり。全体の地図 (`docs/person/design/shared/00-map.md`) から読む',
  '2. `docs/ai/` が持ち場。作り方の仕様と手引き',
  '3. `docs/client/` は提出物。顧客に渡す文書',
  '',
  '## 人の承認',
  '',
  '- 変更を取り込む前に、`git fetch origin` の後で `igeta approval-scope --base origin/<宛先のブランチ>` で確かめる',
  '- 結果が `human` か検査不能なら、AI は取り込まずに人へ渡す',
  '- `docs/person/` の新しい決まりは、状態 `仮` で起案する。人が承認したら `決定` に変わる。この決まりは機械では強制されない',
  '',
  '## 手引きの場所',
  '',
  'Igeta の版に固定した手引き。',
  '',
  `- \`${HANDBOOK_DIR}01-document-taxonomy.md\` — 文書の種類・置き場所・型`,
  `- \`${HANDBOOK_DIR}03-human-review.md\` — 人が読む文書 (地図・決定台帳・レビューシート) の読み方`,
  `- \`${HANDBOOK_DIR}04-provenance-workflow.md\` — 提出物の章の由来の付け方`,
  '',
  '## 検査',
  '',
  '- `npm run docs:check` — 索引・置き場所・本数・AI の入口と、承認する人の割り当て',
  '- `npm run docs:template-check` — 文書の必須構造と、人の文書の型',
  '',
].join('\n');

const AGENTS_NEW_FILE: string = ['# AGENTS.md', '', 'AI がこの repo で作業するときの入口。', '', AGENTS_SECTIONS].join('\n');

/**
 * humanPaths の glob を CODEOWNERS の書き方に写す。`dir/**` は `/dir/`、それ以外は先頭に `/` を付けて repo 直下から数える。
 * CODEOWNERS は `[ ]` の文字集合を読まないので、写せない glob (null) は、当たるファイルがある場合だけ止める。
 */
export function codeownersPatternOf(glob: string): string | null {
  if (/[[\]\\]/.test(glob)) return null;
  if (glob.endsWith('/**')) return `/${glob.slice(0, -2)}`;
  return `/${glob}`;
}

interface HumanLine {
  readonly pattern: string;
  /** glob に当たるいまあるファイル (持ち主の付いたことを確かめるため) */
  readonly files: readonly string[];
}

/** 写せない glob (角括弧)。当たるファイルが、既存の行で持ち主を得ているかを、書く側が確かめる */
interface UnexpressibleGlob {
  readonly glob: string;
  readonly files: readonly string[];
}

/**
 * humanPaths の glob を、CODEOWNERS の行に写す。写せない glob (角括弧) は、行を足せないので別に返す (呼び出し側が、
 * 既存の行で持ち主が付いているかを確かめる)。repoFiles は、書いた後の repo のファイル (docs-migrate は移した後の場所で見る)
 */
function humanLines(humanPaths: readonly string[], repoFiles: readonly string[]): { lines: HumanLine[]; unexpressible: UnexpressibleGlob[] } {
  const lines: HumanLine[] = [];
  const unexpressible: UnexpressibleGlob[] = [];
  for (const glob of humanPaths) {
    const files = repoFiles.filter((file) => matchesGlob(file, glob));
    const pattern = codeownersPatternOf(glob);
    if (pattern === null) unexpressible.push({ glob, files });
    else lines.push({ pattern, files });
  }
  return { lines, unexpressible };
}

export interface ApprovalWrite {
  /** repo 直下からの相対パス */
  readonly relPath: string;
  /** 書いた後のファイルの全文 */
  readonly content: string;
  /** create = 無かったファイルを作る。update = あるファイルに足りない分を足す (既にある内容は変わらない) */
  readonly action: 'create' | 'update';
}

export type ApprovalPlan =
  | { readonly writes: readonly ApprovalWrite[] }
  /** 何も書かずに終わる理由 (1 件以上) */
  | { readonly stops: readonly string[] };

export class ApprovalFilesModule {
  readonly #root: string;

  constructor(targetRoot: string) {
    this.#root = targetRoot;
  }

  /**
   * owner は isOwnerForm を通ったもの (CODEOWNERS の行にそのまま書く)。humanPaths (`.igeta.json`) に当たる、いまあるファイルの
   * うち持ち主の付かないものには、その glob を CODEOWNERS の書き方に写した行を足す (docs-migrate。init は空を渡す)。
   */
  plan(owner: string, humanPaths: readonly string[] = [], filesAfter?: readonly string[]): ApprovalPlan {
    if (!isOwnerForm(owner)) throw new Error(`持ち主の形が違う: ${JSON.stringify(owner)}`);
    const stops: string[] = [];
    const writes = [this.#planAgents(stops), this.#planCodeowners(owner, humanPaths, filesAfter, stops)].filter(
      (write): write is ApprovalWrite => write !== null,
    );
    return stops.length > 0 ? { stops } : { writes };
  }

  #planAgents(stops: string[]): ApprovalWrite | null {
    const path = join(this.#root, AGENTS_FILE);
    if (!existsSync(path)) return { relPath: AGENTS_FILE, content: AGENTS_NEW_FILE, action: 'create' };
    if (!statSync(path).isFile()) {
      stops.push(`${AGENTS_FILE} がファイルでない`);
      return null;
    }
    const text = readFileSync(path, 'utf8');
    if (missingAgentsMentions(text).length === 0) return null;
    const separator = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return { relPath: AGENTS_FILE, content: `${text}${separator}${AGENTS_SECTIONS}`, action: 'update' };
  }

  #planCodeowners(owner: string, humanPaths: readonly string[], filesAfter: readonly string[] | undefined, stops: string[]): ApprovalWrite | null {
    const others = OTHER_CODEOWNERS_FILES.filter((file) => existsSync(join(this.#root, file)));
    for (const file of others) {
      stops.push(
        `${file} がある。${CODEOWNERS_FILE} を作ると GitHub はそちらだけを読み、既にある ${file} が読まれなくなる。` +
          `${file} に持ち主の行を足すか、${CODEOWNERS_FILE} へ移してから実行する`,
      );
    }
    if (others.length > 0) return null;

    const lineOf = (pattern: string): string => `${pattern} ${owner}`;
    const { lines: human, unexpressible } = humanLines(humanPaths, filesAfter ?? listRepoFiles(this.#root));
    const path = join(this.#root, CODEOWNERS_FILE);
    if (!existsSync(path)) {
      for (const item of unexpressible) {
        if (item.files.length > 0) stops.push(`humanPaths の ${item.glob} は CODEOWNERS の書き方に写せない (角括弧)。${item.files.length} 件に当たり、行を足せない`);
      }
      const created = [...CODEOWNERS_TARGETS.map((target) => lineOf(target.pattern)), ...human.map((item) => lineOf(item.pattern))];
      return { relPath: CODEOWNERS_FILE, content: `${created.join('\n')}\n`, action: 'create' };
    }
    if (!statSync(path).isFile()) {
      stops.push(`${CODEOWNERS_FILE} がファイルでない`);
      return null;
    }

    const text = readFileSync(path, 'utf8');
    const entries = parseCodeowners(text);
    const missing = CODEOWNERS_TARGETS.filter((target) => codeownersProblems(entries, target.paths).length > 0);
    const missingHuman = human.filter((item) => codeownersProblems(entries, item.files).length > 0);
    // 角括弧の glob は、当たるファイルに既存の行で持ち主が付いていれば足りている (2 回目の実行で止めない)
    for (const item of unexpressible) {
      const problems = codeownersProblems(entries, item.files);
      if (problems.length > 0) stops.push(`humanPaths の ${item.glob} は CODEOWNERS の書き方に写せず、持ち主の付かないファイルがある: ${problems.slice(0, 3).join(' / ')}。その行を 1 件ずつ書く`);
    }
    if (missing.length === 0 && missingHuman.length === 0) return null;

    const prepended = [...missing.map((target) => lineOf(target.pattern)), ...missingHuman.map((item) => lineOf(item.pattern))];
    const content = `${prepended.join('\n')}\n${text}`;
    const remaining = codeownersProblems(
      parseCodeowners(content),
      [...CODEOWNERS_TARGETS.flatMap((target) => target.paths), ...human.flatMap((item) => item.files)],
    );
    if (remaining.length > 0) {
      stops.push(
        `${CODEOWNERS_FILE} に行を足しても、持ち主が付かないパスが残る: ${remaining.join(' / ')}。` +
          '後ろの行が、先頭に足す行を上書きしている。その行に持ち主を付けるか、消してから実行する',
      );
      return null;
    }
    return { relPath: CODEOWNERS_FILE, content, action: 'update' };
  }
}
