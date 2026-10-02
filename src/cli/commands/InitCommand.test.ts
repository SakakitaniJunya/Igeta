// node --test dist/cli/commands/InitCommand.test.js
// `igeta init` の受入 (テスト仕様 06 の表: TST-101〜107・TST-301〜304・TST-306)。一時フォルダに実際に init を実行して確かめる。
// 持ち主は架空の @lead・@other。個人情報は無い。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AgentsEntrypointCheck, CODEOWNERS_TARGETS } from '../../checks/AgentsEntrypointCheck.js';
import { DocsCheck } from '../../checks/DocsCheck.js';
import { DocTemplateCheck } from '../../checks/DocTemplateCheck.js';
import { AUDIENCE_ENTRANCE } from '../../core/Audience.js';
import { lastMatchingEntry, parseCodeowners } from '../../core/Codeowners.js';
import { idOf } from '../../core/DecisionRows.js';
import { listDocFiles } from '../../core/DocFiles.js';
import { ExitCode } from '../../core/ExitCode.js';
import { parseFrontmatter, scalar } from '../../core/Frontmatter.js';
import { classifyLines } from '../../core/LineClassifier.js';
import { findTables } from '../../core/MarkdownTable.js';
import { IGETA_ROOT } from '../../core/Paths.js';
import { kindOfPath } from '../../core/Role.js';
import { pathRule } from '../../gate/ApprovalScope.js';
import { isOwnerForm } from '../../generators/ApprovalFilesModule.js';
import { Cli } from '../Cli.js';
import { InitCommand } from './InitCommand.js';

const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'igeta-init-'));
  workspaces.push(root);
  return root;
};

function write(root: string, relPath: string, content: string): void {
  const target = join(root, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const read = (root: string, relPath: string): string => readFileSync(join(root, relPath), 'utf8');

interface Run {
  readonly code: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

/** 実際のコマンドの入口 (Cli) から init を実行する。引数の誤りは、Cli が終了コード 2 に変える */
async function runInit(root: string, args: readonly string[]): Promise<Run> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await new Cli().register(new InitCommand()).run(['init', ...args, '--root', root], {
    cwd: root,
    igetaRoot: IGETA_ROOT,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** フォルダの中の全ファイルの、パスと内容 (何も書かなかったことを、前後で比べる) */
function snapshot(root: string): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.set(rel, readFileSync(join(dir, entry.name), 'utf8'));
    }
  };
  walk(root, '');
  return files;
}

const OWNER = '@lead';

/** init が雛形から置く人の文書 3 本 (docs/ からの相対パス) */
const PERSON_DOCS: readonly string[] = [
  'person/design/shared/00-map.md',
  'person/requirements/01-requirements.md',
  'person/decisions/01-decisions.md',
];

/** 文書の表の、データの行の全部 (最初のセルが ID の形なら、id も) */
function tableRows(text: string): ReadonlyArray<{ readonly cells: readonly string[]; readonly id: string | null }> {
  const lines = text.split('\n');
  return findTables(lines, classifyLines(lines), 0).flatMap((table) => table.rows.map((row) => ({ cells: row.cells, id: idOf(row.cells[0]) })));
}

/** I1 が置くファイル */
const I1_FILES: readonly string[] = [
  '.igeta-version',
  'docs/README.md',
  'docs/person/design/shared/00-map.md',
  'docs/person/requirements/01-requirements.md',
  'docs/person/decisions/01-decisions.md',
  'docs/person/decisions/README.md',
  'AGENTS.md',
  '.github/CODEOWNERS',
  '.markdownlint.yaml',
  '.markdownlint-cli2.yaml',
  'package.json',
];

/** 利用 repo の docs/ には置かない kind (手引き 3 本と、設計を始めるときに作る実装順序) */
const KINDS_NOT_PLACED: readonly string[] = ['document-taxonomy', 'human-review', 'provenance-workflow', 'implementation-order'];

/** ADR-0008 決定 1 の代表のパス (テスト仕様 01 の TST-103 の 11 本と、person・client の文書、下位の CLAUDE.md) */
const DECISION_1_PATHS: readonly string[] = [
  'docs/person/requirements/01-requirements.md',
  'docs/person/design/shared/00-map.md',
  'docs/person/decisions/2026/0001-x.md',
  'docs/client/delivery/x/01.md',
  'docs/client/proposals/2026/01-proposal.md',
  '.github/workflows/x.yml',
  '.github/actions/a/action.yml',
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
  '.igeta.json',
  '.igeta-version',
  'AGENTS.md',
  'docs/ai/AGENTS.md',
  'CLAUDE.md',
  'apps/web/CLAUDE.md',
  '.claude/settings.json',
];

/** README の文字列で、入口の 3 行が、1 字も違わない 1 行ずつとして、索引の区間の外にあるか。違いの説明 (空なら一致) */
function entranceDiffs(readme: string): string[] {
  const lines = readme.split('\n');
  const regionStart = lines.findIndex((line) => line.includes('AUTOGEN:dir-index:start'));
  return AUDIENCE_ENTRANCE.flatMap((entrance) => {
    const at = lines.indexOf(entrance);
    if (at === -1) return [`入口の行が無い (1 字でも違う): ${entrance}`];
    return regionStart !== -1 && at > regionStart ? [`索引の区間の中にある: ${entrance}`] : [];
  });
}

describe('init: 置くもの (I1〜I4・I10)', () => {
  it('[TST-101] 空のフォルダに init --owner @lead: I1 のファイルが全部あり、docs-check と template-check が違反 0 件・警告 0 件。手引き・実装順序の文書は無い。置いた markdownlint の設定で lint も 0 件', async () => {
    const root = makeRoot();
    const { code, stderr } = await runInit(root, ['--owner', OWNER]);
    assert.equal(code, ExitCode.Ok, stderr);
    for (const relPath of I1_FILES) assert.ok(existsSync(join(root, relPath)), `置かれていない: ${relPath}`);

    const ctx = { targetRoot: root, igetaRoot: IGETA_ROOT };
    const docsCheck = new DocsCheck();
    assert.deepEqual(await docsCheck.run(ctx), [], 'docs-check の違反');
    assert.deepEqual(docsCheck.warnings, [], 'docs-check の警告');
    const templateCheck = new DocTemplateCheck({ requireKind: true, requireHumanReview: true });
    assert.deepEqual(templateCheck.run(ctx), [], 'template-check --require-kind --require-human-review の違反');
    assert.deepEqual(templateCheck.warnings, [], 'template-check の警告');

    // init が置いた markdownlint の設定 (.markdownlint.yaml・.markdownlint-cli2.yaml) のまま、置いた直後の文書の lint が 0 件
    const lint = spawnSync(process.execPath, [join(IGETA_ROOT, 'node_modules', 'markdownlint-cli2', 'markdownlint-cli2-bin.mjs')], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(lint.status, 0, `markdownlint-cli2: ${lint.stdout}${lint.stderr}`);

    const docsDir = join(root, 'docs');
    const kinds = listDocFiles(docsDir).flatMap((rel) => {
      const kind = scalar(parseFrontmatter(read(root, `docs/${rel}`).split('\n'))?.data ?? new Map(), 'kind');
      return kind === undefined ? [] : [kind];
    });
    assert.deepEqual(
      kinds.filter((kind) => KINDS_NOT_PLACED.includes(kind)),
      [],
    );

    // I3: 記入例の行は置かず、ID の行は、要件の最初の業務要件 (REQ-001) の 1 行だけ (状態は未決)。<…> の記入例の行も残さない
    const rows = PERSON_DOCS.flatMap((rel) => tableRows(read(root, `docs/${rel}`)));
    assert.deepEqual(
      rows.filter((row) => row.id !== null).map((row) => [row.id, row.cells.at(-1)]),
      [['REQ-001', '未決']],
    );
    assert.deepEqual(
      rows.filter((row) => row.cells.some((cell) => /<[^>]+>/.test(cell))),
      [],
      '<…> の記入例の行が残っている',
    );
  });

  it('[TST-102] 決定台帳: 生成区間に要件の最初の行が `未決` で 1 行ある。DEC・OPEN の表は見出しだけ', async () => {
    const root = makeRoot();
    assert.equal((await runInit(root, ['--owner', OWNER])).code, ExitCode.Ok);
    const lines = read(root, 'docs/person/decisions/01-decisions.md').split('\n');

    const dataRowsOf = (from: number, to: number): string[] =>
      lines.slice(from, to).filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line)).slice(1);
    const sectionAt = (heading: string): number => lines.findIndex((line) => line.startsWith(heading));
    const dec = sectionAt('## 1. 決定 (DEC)');
    const open = sectionAt('## 2. 未決 (OPEN)');
    const tentative = sectionAt('## 3. 仮置き一覧');
    assert.deepEqual(dataRowsOf(dec, open), [], 'DEC の表は見出しだけ');
    assert.deepEqual(dataRowsOf(open, tentative), [], 'OPEN の表は見出しだけ');

    const start = lines.findIndex((line) => line.includes('AUTOGEN:tentative-index:start'));
    const end = lines.findIndex((line) => line.includes('AUTOGEN:tentative-index:end'));
    const region = dataRowsOf(start, end + 1);
    assert.equal(region.length, 1, `生成区間の行: ${region.join(' / ')}`);
    assert.match(region[0] ?? '', /REQ-001/);
    assert.match(region[0] ?? '', /未決/);
  });

  it('[TST-103] CODEOWNERS: init の直後に AgentsEntrypointCheck を当てると、決定 1 の代表のパスの全部に @lead が付く (下位の docs/ai/AGENTS.md・apps/web/CLAUDE.md を含む)', async () => {
    const root = makeRoot();
    assert.equal((await runInit(root, ['--owner', OWNER])).code, ExitCode.Ok);
    assert.deepEqual(new AgentsEntrypointCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT }), []);

    const entries = parseCodeowners(read(root, '.github/CODEOWNERS'));
    for (const path of DECISION_1_PATHS) {
      assert.notEqual(pathRule(path, []), null, `${path} は決定 1 のパスではない (見分けの正本 pathRule が human にしない)`);
      assert.deepEqual(lastMatchingEntry(entries, path)?.owners, [OWNER], `${path} の持ち主`);
    }
    // 検査が持ち主を確かめる代表のパスの全部にも @lead が付き、下位の AGENTS.md・CLAUDE.md を含む。どれも決定 1 のパス
    // (見分けの正本と食い違わない)。docs/person・client の代表は、置き場所の表の場所
    const representatives = CODEOWNERS_TARGETS.flatMap((target) => target.paths);
    for (const lower of ['docs/ai/AGENTS.md', 'apps/web/CLAUDE.md']) assert.ok(representatives.includes(lower), `下位のパスが代表のパスに無い: ${lower}`);
    for (const path of representatives) {
      assert.deepEqual(lastMatchingEntry(entries, path)?.owners, [OWNER], `代表の ${path} の持ち主`);
      assert.notEqual(pathRule(path, []), null, `代表の ${path} が、見分けの正本で human にならない`);
      if (path.startsWith('docs/person/') || path.startsWith('docs/client/')) {
        assert.notEqual(kindOfPath(path.slice('docs/'.length)), null, `${path} が置き場所の表の場所ではない`);
      }
    }
  });

  it('[TST-104] 足りない分: AGENTS.md (docs に触れない) と /docs/person/design/x/ @other だけの CODEOWNERS がある repo に init すると、末尾に入口の節・先頭に足りない行が足され、docs/person/design/x/a.md の持ち主は @other のまま', async () => {
    const root = makeRoot();
    const agents = '# 既存の AGENTS.md\n\nこの repo の決まり。\n';
    const codeowners = '/docs/person/design/x/ @other\n';
    write(root, 'AGENTS.md', agents);
    write(root, '.github/CODEOWNERS', codeowners);

    const { code, stderr } = await runInit(root, ['--owner', OWNER]);
    assert.equal(code, ExitCode.Ok, stderr);

    const newAgents = read(root, 'AGENTS.md');
    assert.ok(newAgents.startsWith(agents), '既にある内容は変わらない');
    const appended = newAgents.slice(agents.length);
    for (const heading of ['## 読む順', '## 人の承認', '## 手引きの場所', '## 検査']) assert.ok(appended.includes(heading), `足されていない: ${heading}`);

    const newCodeowners = read(root, '.github/CODEOWNERS');
    assert.ok(newCodeowners.endsWith(codeowners), '既にある行は、そのまま末尾に残る');
    const entries = parseCodeowners(newCodeowners);
    assert.equal(entries.length, CODEOWNERS_TARGETS.length + 1);
    assert.deepEqual(lastMatchingEntry(entries, 'docs/person/design/x/a.md')?.owners, ['@other']);
    assert.deepEqual(lastMatchingEntry(entries, 'docs/person/requirements/01-requirements.md')?.owners, [OWNER]);
    assert.deepEqual(new AgentsEntrypointCheck().run({ targetRoot: root, igetaRoot: IGETA_ROOT }), []);
  });

  it('[TST-105] AGENTS.md: 見出しは 4 つ、手引き 3 本のパスはコードスパンでリンクは無い。「人の承認」の節に git fetch origin・origin/・人へ渡す がある', async () => {
    const root = makeRoot();
    assert.equal((await runInit(root, ['--owner', OWNER])).code, ExitCode.Ok);
    const text = read(root, 'AGENTS.md');

    assert.deepEqual(
      text.split('\n').filter((line) => line.startsWith('## ')),
      ['## 読む順', '## 人の承認', '## 手引きの場所', '## 検査'],
    );
    const handbookDir = 'node_modules/igeta/templates/docs/ai/handbook/how-to/';
    for (const name of ['01-document-taxonomy.md', '03-human-review.md', '04-provenance-workflow.md']) {
      assert.ok(text.includes(`\`${handbookDir}${name}\``), `コードスパンで書かれていない: ${name}`);
      // 指す先の手引きが、Igeta の版の中に実在する (名前が変わったら、ここで落ちる)
      assert.ok(existsSync(join(IGETA_ROOT, 'templates/docs/ai/handbook/how-to', name)), `手引きが無い: ${name}`);
    }
    assert.equal(/\]\(/.test(text), false, 'リンク ([..](..)) がある');

    const approval = text.slice(text.indexOf('## 人の承認'), text.indexOf('## 手引きの場所'));
    for (const word of ['git fetch origin', 'origin/', '人へ渡す']) assert.ok(approval.includes(word), `「人の承認」の節に無い: ${word}`);
  });

  it('[TST-106] scripts: package.json に I10 の 4 つの script があり、標準出力に次の手順の 3 行がある', async () => {
    const root = makeRoot();
    const { code, stdout } = await runInit(root, ['--owner', OWNER]);
    assert.equal(code, ExitCode.Ok);

    const scripts: unknown = (JSON.parse(read(root, 'package.json')) as { scripts?: unknown }).scripts;
    assert.deepEqual(scripts, {
      'docs:graph': 'igeta docs-graph',
      'docs:check': 'igeta docs-check',
      'docs:template-check': 'igeta template-check --require-kind --require-human-review',
      scaffold: 'igeta scaffold',
    });
    const next = stdout.split('\n').filter((line) => line.startsWith('NEXT'));
    assert.equal(next.length, 3, stdout);
    assert.ok(next[0]?.includes('npm install && npm run docs:check'));
    assert.ok(next[1]?.includes('igeta doctor') && next[1].includes('GitHub の保護'));
    assert.ok(next[2]?.includes('.mcp.json') && next[2].includes('.igeta.json') && next[2].includes('humanPaths'));
  });
});

describe('init: 入口の 3 行 (I11)', () => {
  it('[TST-107] AUDIENCE_ENTRANCE・init の docs/README.md・templates/docs/README.md の 3 行が、1 字も違わず、索引の区間の外にある', async () => {
    const root = makeRoot();
    assert.equal((await runInit(root, ['--owner', OWNER])).code, ExitCode.Ok);
    assert.equal(AUDIENCE_ENTRANCE.length, 3);
    assert.deepEqual(entranceDiffs(read(root, 'docs/README.md')), [], 'init の docs/README.md');
    assert.deepEqual(entranceDiffs(readFileSync(join(IGETA_ROOT, 'templates', 'docs', 'README.md'), 'utf8')), [], 'templates/docs/README.md');
  });

  it('[TST-306] 入口がずれる: templates/docs/README.md の入口の 1 字を変える・1 行を消す・1 字を足すと、突き合わせが違いを見つける', () => {
    const template = readFileSync(join(IGETA_ROOT, 'templates', 'docs', 'README.md'), 'utf8');
    const first = AUDIENCE_ENTRANCE[0] ?? '';
    assert.ok(template.includes(first), 'この試験の前提: 雛形に入口の 1 行目がある');
    const mutations: ReadonlyArray<readonly [string, string]> = [
      ['1 字を変える', template.replace(first, first.replace('人が決める', '人が決めろ'))],
      ['1 行を消す', template.replace(`${first}\n`, '')],
      ['行末に 1 字を足す', template.replace(first, `${first}。`)],
    ];
    for (const [what, mutated] of mutations) {
      assert.notEqual(mutated, template, `この試験の前提: ${what}で雛形が変わる`);
      assert.notDeepEqual(entranceDiffs(mutated), [], `${what}: 見つけられなかった`);
    }
  });
});

describe('init: 何も書かずに終わる (I5〜I8)', () => {
  it('[TST-301] 持ち主が無い・形が違う: --owner なし / lead / @ / "@a b" は、何も書かずに終わる (引数の誤り)', async () => {
    for (const owner of ['@user', '@org/team', 'lead@example.com']) assert.ok(isOwnerForm(owner), `形が正しい持ち主を断った: ${owner}`);
    for (const args of [[], ['--owner', 'lead'], ['--owner', '@'], ['--owner', '@a b']]) {
      const root = makeRoot();
      const { code, stderr } = await runInit(root, args);
      assert.equal(code, ExitCode.CannotCheck, `${args.join(' ')}: ${stderr}`);
      assert.match(stderr, /--owner/);
      assert.deepEqual([...snapshot(root).keys()], [], `${args.join(' ')}: 何かを書いた`);
    }
  });

  it('[TST-302] 重なる: .igeta-version・.markdownlint.yaml・docs/README.md のどれかが既にあると、CONFLICT を出し、1 ファイルも書かない', async () => {
    for (const existing of ['.igeta-version', '.markdownlint.yaml', 'docs/README.md']) {
      const root = makeRoot();
      write(root, existing, '既にある\n');
      const before = snapshot(root);
      const { code, stderr } = await runInit(root, ['--owner', OWNER]);
      assert.equal(code, ExitCode.Violation, existing);
      assert.ok(stderr.includes(`CONFLICT ${existing}`), `${existing}: ${stderr}`);
      assert.deepEqual([...snapshot(root)], [...before], `${existing}: 書いた`);
    }
  });

  it('[TST-303] 旧い docs がある: docs/design/basic/01-function-list.md がある repo は、書かずに移行の案内を出す (重なるファイルの衝突より先)', async () => {
    const root = makeRoot();
    write(root, 'docs/design/basic/01-function-list.md', '---\nkind: function-list\n---\n# 機能一覧\n');
    write(root, '.igeta-version', '0.4.0\n');
    const before = snapshot(root);
    const { code, stderr } = await runInit(root, ['--owner', OWNER]);
    assert.equal(code, ExitCode.Violation);
    assert.ok(stderr.includes('移行コマンド `igeta docs-migrate` は次の版で入る'), stderr);
    assert.equal(stderr.includes('CONFLICT'), false, '衝突の報告が先に出た');
    assert.deepEqual([...snapshot(root)], [...before]);
  });

  it('[TST-304] 持ち主が付かない: 最後の行が持ち主の無い /docs/person/ の CODEOWNERS / repo 直下の CODEOWNERS / docs/ の CODEOWNERS は、何も書かずに終わる', async () => {
    const fixtures: ReadonlyArray<readonly [string, string]> = [
      ['.github/CODEOWNERS', '* @other\n/docs/person/\n'],
      ['CODEOWNERS', '* @other\n'],
      ['docs/CODEOWNERS', '* @other\n'],
    ];
    for (const [relPath, content] of fixtures) {
      const root = makeRoot();
      write(root, relPath, content);
      const before = snapshot(root);
      const { code, stderr } = await runInit(root, ['--owner', OWNER]);
      assert.equal(code, ExitCode.Violation, `${relPath}: ${stderr}`);
      assert.ok(stderr.includes('STOP'), `${relPath}: ${stderr}`);
      assert.deepEqual([...snapshot(root)], [...before], `${relPath}: 書いた`);
    }
  });
});
