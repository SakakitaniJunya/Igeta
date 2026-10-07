// node --test dist/checks/PersonDiagram.test.js
// テスト仕様 08 (docs/design/test/specs/08-person-diagram.md) の表の行ごとに 1 本。名前に TST の番号を入れる。
// TST-101 (雛形 16 本)・TST-314 (雛形の描画) は TemplatesPersonForm.test.ts、TST-108・315 は TaxonomyGuideSync.test.ts が持つ。
// 一時ディレクトリに新しい構成の docs を作り、PersonFormCheck の図の規則 (D1〜D4) と、MermaidBlocks (D5) を確かめる。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractMermaidBlocks } from '../core/MermaidBlocks.js';
import type { Violation } from '../core/Report.js';
import { findChromiumExecutable } from '../export/Chromium.js';
import { checkMermaidRendering } from './MermaidCheck.js';
import { PersonFormCheck } from './PersonFormCheck.js';

const workspaces: string[] = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-persondiagram-'));
  workspaces.push(root);
  return root;
}

function write(root: string, rel: string, lines: readonly string[]): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join('\n')}\n`);
}

/** 版だけを持つ Igeta の package.json (PersonFormCheck は字数の上限を見るときだけ読む) */
const IGETA_ROOT_FOR_TEST = (() => {
  const dir = makeRoot();
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'igeta', version: '0.9.9' }));
  return dir;
})();

interface Result {
  readonly violations: readonly Violation[];
  readonly warnings: readonly string[];
}

function runCheck(root: string): Result {
  const check = new PersonFormCheck({ templates: new Map() });
  const violations = check.run({ targetRoot: root, igetaRoot: IGETA_ROOT_FOR_TEST });
  return { violations, warnings: check.warnings };
}

/** kind ごとの置き場所 (図が要る kind のうち、使うもの) */
const PATHS: Readonly<Record<string, string>> = {
  operations: 'person/design/shared/08-operations.md',
  'migration-plan': 'person/design/shared/09-migration-plan.md',
  nonfunctional: 'person/design/shared/03-nonfunctional.md',
  risks: 'person/design/shared/07-risks-tech-debt.md',
  requirements: 'person/requirements/01-requirements.md',
  'data-management': 'person/design/shared/05-data-management.md',
  'screen-spec': 'person/design/shop/screens/01-top.md',
  map: 'person/design/shared/00-map.md',
};
const KIND_OF: Readonly<Record<string, string>> = { risks: 'risks-tech-debt' };

/** frontmatter と題名と TL;DR (見出しなし) の次に body を置いた文書 */
function doc(kind: string | null, body: readonly string[]): string[] {
  return [
    '---',
    'id: sample',
    'title: 例',
    'type: design',
    ...(kind === null ? [] : [`kind: ${kind}`]),
    'status: active',
    'owners: [product]',
    ...(kind === 'screen-spec' ? ['context: shop'] : []),
    '---',
    '',
    '# 例',
    '',
    '> **TL;DR**: 例',
    '',
    ...body,
  ];
}

const fence = (type: string, content: readonly string[] = ['  A[予約] --> B[確定]'], marker = '```'): string[] => [marker + 'mermaid', type, ...content, marker, ''];
const FLOW = fence('flowchart TB');
const TABLE = ['| 項目 | 内容 |', '|---|---|', '| a | b |', ''];

/** path の文書だけを置いた repo を検査する。図の規則 (D) の違反だけを返す (P3〜P6 は決まりの表を要さない kind で見る) */
function check(key: string, body: readonly string[], kind: string = KIND_OF[key] ?? key): Result {
  const root = makeRoot();
  write(root, 'person/README.md', ['# person']);
  write(root, PATHS[key] ?? assert.fail(key), doc(kind, body));
  return runCheck(root);
}

/** 本文の最初の行 (1 始まり) */
const BODY_START_LINE = doc('operations', []).length + 1;
const figureLine = (body: readonly string[]): number => BODY_START_LINE + body.findIndex((line) => line.startsWith('```mermaid'));

const messages = (result: Result): string[] => result.violations.map((violation) => `${violation.line}: ${violation.message}`);

describe('テスト仕様 08 §1 テストケース一覧', () => {
  it('[TST-102] 許す図種が複数の kind (migration-plan) に flowchart / gantt / timeline のどれか 1 枚 → 違反 0 件', () => {
    const figures: ReadonlyArray<readonly string[]> = [
      fence('flowchart LR'),
      fence('gantt', ['  title 切替', '  section 準備', '  先行 :a1, 2026-01-01, 7d']),
      fence('timeline', ['  title 切替', '  段階 1 : 先行']),
    ];
    for (const figure of figures) assert.deepEqual(messages(check('migration-plan', [...figure, ...TABLE])), [], figure[1]);
  });

  it('[TST-103] graph TD・stateDiagram-v2・1 行の %%{init}%%・複数行の指示・先頭の --- の設定を、図種の先頭の語で読み、許す kind では違反 0 件', () => {
    const flowKinds: ReadonlyArray<readonly string[]> = [
      fence('graph TD'),
      fence('%%{init: {"theme": "neutral"}}%%', ['flowchart TB', '  A --> B']),
      fence('%%{init: {', ['  "theme": "neutral"', '}}%%', 'flowchart TB', '  A --> B']),
      fence('---', ['title: 例', '---', 'flowchart TB', '  A --> B']),
      fence('%% 例の注釈', ['', 'flowchart TB', '  A --> B']),
    ];
    for (const figure of flowKinds) assert.deepEqual(messages(check('operations', figure)), [], figure.join('\n'));
    assert.deepEqual(messages(check('screen-spec', fence('stateDiagram-v2', ['  [*] --> 一覧', '  一覧 --> 詳細']))), []);
    const [block] = extractMermaidBlocks(fence('graph TD'), 0);
    assert.equal(block?.type, 'flowchart');
    assert.equal(extractMermaidBlocks(fence('stateDiagram-v2'), 0)[0]?.type, 'stateDiagram');
  });

  it('[TST-104] 図が TL;DR の直後 (見出しなし) / 最初の節の中で、同じ節の表より前 / ### の下 → 違反 0 件', () => {
    assert.deepEqual(messages(check('operations', [...FLOW, ...TABLE])), []);
    assert.deepEqual(messages(check('operations', ['## 1. 全体', '', ...FLOW, ...TABLE, '## 2. 詳細', ''])), []);
    assert.deepEqual(messages(check('operations', ['## 1. 全体', '', '### 1.1 流れ', '', ...FLOW, ...TABLE, '## 2. 詳細', ''])), []);
  });

  it('[TST-105] 図の bodyLines が 40 行ちょうどは何も出ない。41 行は警告 1 件・違反 0 件 (%% の行も数える)', () => {
    const lines = (count: number): string[] => ['  A --> B', ...Array.from({ length: count - 1 }, (_, i) => `  %% 注釈 ${i}`)];
    const at40 = check('operations', [...fence('flowchart TB', lines(40)), ...TABLE]);
    assert.deepEqual([at40.violations, at40.warnings], [[], []]);
    const at41 = check('operations', [...fence('flowchart TB', lines(41)), ...TABLE]);
    assert.equal(at41.violations.length, 0);
    assert.equal(at41.warnings.length, 1);
    assert.match(at41.warnings[0] ?? '', /41 行/);
  });

  it('[TST-106] ~~~mermaid の図 (構文が壊れている) は PersonFormCheck が図として数え、MermaidCheck は描画の誤りを出す', async (t) => {
    const broken = fence('flowchart TB', ['  A --> --> ((']).map((line) => line.replace('```', '~~~'));
    assert.deepEqual(messages(check('operations', [...broken, ...TABLE])), [], 'PersonFormCheck は図として数える');
    if (findChromiumExecutable() === null) {
      t.skip('Chromium が無いので、描画の誤りは確かめない (npx playwright install chromium で走る)');
      return;
    }
    const root = makeRoot();
    write(root, 'x.md', ['# x', '', ...broken]);
    const { violations } = await checkMermaidRendering({ targetRoot: root });
    assert.equal(violations.length, 1);
    assert.equal(violations[0]?.severity, 'violation');
    assert.equal(violations[0]?.line, 3);
  });

  it('[TST-107] 旧い構成の repo / docs/ai/ の文書 / 図が無い README.md → 何も出ない', () => {
    const legacy = makeRoot();
    write(legacy, 'design/flows/01-x.md', doc('business-flow', ['表だけ。']));
    assert.deepEqual(runCheck(legacy).violations, []);
    const root = makeRoot();
    write(root, 'person/README.md', ['# person', '', '> このディレクトリの目的: 人が確定させる文書。']);
    write(root, 'ai/specs/shared/01-crosscutting.md', doc('crosscutting', ['表だけ。']));
    assert.deepEqual(runCheck(root).violations, []);
  });
});

describe('テスト仕様 08 §2 否定テスト', () => {
  const diagramViolation = (result: Result): readonly Violation[] => result.violations.filter((violation) => /図/.test(violation.message));

  it('[TST-301] 図が無い: 表だけ / 画像のリンクだけ / 別のフェンスの中の mermaid だけ / 引用の中・タブ字下げの mermaid だけ → 違反 (D2。1 行目)', () => {
    const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['表だけ', TABLE],
      ['画像のリンクだけ', ['![図](./a.png)', '', ...TABLE]],
      ['別のフェンスの中', ['````markdown', '```mermaid', 'flowchart TB', '  A --> B', '```', '````', '', ...TABLE]],
      ['引用の中', ['> ```mermaid', '> flowchart TB', '>   A --> B', '> ```', '', ...TABLE]],
      ['タブ字下げ', ['\t```mermaid', '\tflowchart TB', '\t  A --> B', '\t```', '', ...TABLE]],
    ];
    for (const [name, body] of cases) {
      const result = check('operations', body);
      assert.equal(result.violations.length, 1, `${name}: ${messages(result).join('\n')}`);
      assert.equal(result.violations[0]?.line, 1, name);
      assert.match(result.violations[0]?.message ?? '', /^図が無い/, name);
    }
  });

  it('[TST-302] 空の図: 中が空 / 図種の行だけ / %% の行だけ → 違反 (D2「中身が無い」)', () => {
    for (const [name, figure] of [
      ['中が空', ['```mermaid', '```', '']],
      ['図種の行だけ', fence('flowchart TB', [])],
      ['%% の行だけ', ['```mermaid', '%% 注釈だけ', '```', '']],
    ] as const) {
      const result = check('operations', [...figure, ...TABLE]);
      assert.equal(result.violations.length, 1, name);
      assert.match(result.violations[0]?.message ?? '', /中身が無い/, name);
    }
  });

  it('[TST-303] 別図種: nonfunctional に flowchart だけ / risks に pie / requirements に gitGraph / data-management に erDiagram → 違反 (D2「許されない」。許す図種を出す)', () => {
    const cases: ReadonlyArray<readonly [string, string, string, RegExp]> = [
      ['nonfunctional', 'flowchart TB', '  A --> B', /flowchart は kind nonfunctional では許されない \(許すのは quadrantChart・mindmap\)/],
      ['risks', 'pie', '  "a" : 1', /pie は kind risks-tech-debt では許されない \(許すのは quadrantChart\)/],
      ['requirements', 'gitGraph', '  commit', /gitGraph は kind requirements では許されない \(許すのは flowchart\)/],
      ['data-management', 'erDiagram', '  A ||--o{ B : has', /erDiagram は kind data-management では許されない/],
    ];
    for (const [key, type, content, expected] of cases) {
      const result = check(key, [...fence(type, [content]), ...TABLE]);
      assert.equal(result.violations.length, 1, key);
      assert.match(result.violations[0]?.message ?? '', expected, key);
    }
  });

  it('[TST-304] 図種の綴り: flowchar・Flowchart・quadrantchart・図種の行が無く node だけ・設定の --- が閉じない → 違反 (D2「図種を読めない」)', () => {
    const cases: ReadonlyArray<readonly string[]> = [
      fence('flowchar TB'),
      fence('Flowchart TB'),
      fence('quadrantchart'),
      ['```mermaid', '  A --> B', '```', ''],
      fence('---', ['title: 例', 'flowchart TB', '  A --> B']),
    ];
    for (const figure of cases) {
      const result = check('operations', [...figure, ...TABLE]);
      assert.equal(result.violations.length, 1, figure.join('\n'));
      assert.match(result.violations[0]?.message ?? '', /図種を読めない/, figure.join('\n'));
    }
  });

  it('[TST-305] 閉じない: 開いて閉じない / 閉じが短い / 閉じに info が付く / 閉じを字下げ 4 つにする → 違反 (D2「閉じていない」。開始行)', () => {
    const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['閉じない', ['```mermaid', 'flowchart TB', '  A --> B', '', ...TABLE]],
      ['閉じが短い', ['````mermaid', 'flowchart TB', '  A --> B', '```', '', ...TABLE]],
      ['閉じに info', ['```mermaid', 'flowchart TB', '  A --> B', '```mermaid', '', ...TABLE]],
      ['閉じが字下げ 4 つ', ['```mermaid', 'flowchart TB', '  A --> B', '    ```', '', ...TABLE]],
    ];
    for (const [name, body] of cases) {
      const result = check('operations', body);
      assert.equal(result.violations.length, 1, `${name}: ${messages(result).join('\n')}`);
      assert.equal(result.violations[0]?.line, 1, name);
      assert.match(result.violations[0]?.message ?? '', new RegExp(`${BODY_START_LINE} 行目の図が閉じていない`), name);
    }
  });

  it('[TST-306] 文末の図: 「決めてほしいこと」の後ろ / 最初の表の後ろ / 2 つ目の ## の後ろ → 違反 (D3。その図の開始行)', () => {
    const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['決めてほしいことの後ろ', ['## 1. 全体', '', ...TABLE, '## 決めてほしいこと', '', ...FLOW]],
      ['最初の表の後ろ', [...TABLE, ...FLOW]],
      ['2 つ目の ## の後ろ', ['## 1. 全体', '', '説明。', '', '## 2. 詳細', '', ...FLOW]],
    ];
    for (const [name, body] of cases) {
      const line = figureLine(body);
      const result = check('operations', body);
      assert.equal(result.violations.length, 1, `${name}: ${messages(result).join('\n')}`);
      assert.equal(result.violations[0]?.line, line, name);
      assert.match(result.violations[0]?.message ?? '', /冒頭にない/, name);
    }
  });

  it('[TST-307] 位置の逃げ: 許さない図種を冒頭に置き許す図を文末に / ## をフェンスの中に書いて節の数を減らす / 縦棒を省いた表を図の前に置く → どれも違反 (D3)', () => {
    const pie = fence('pie', ['  "a" : 1']);
    const result1 = check('operations', [...pie, ...TABLE, ...FLOW]);
    assert.equal(result1.violations.length, 1, messages(result1).join('\n'));
    assert.match(result1.violations[0]?.message ?? '', /冒頭にない/);
    // ## をフェンスの中に書いても、節の数に入れない (2 つ目の ## は本物の見出し)
    const result2 = check('operations', ['## 1. 全体', '', '```text', '## 2. 偽の見出し', '```', '', '## 2. 本物', '', ...FLOW]);
    assert.equal(result2.violations.length, 1, messages(result2).join('\n'));
    assert.match(result2.violations[0]?.message ?? '', /冒頭にない/);
    // 縦棒を省いた表も表として数える
    const result3 = check('operations', ['項目 | 内容', '---|---', 'a | b', '', ...FLOW]);
    assert.equal(result3.violations.length, 1, messages(result3).join('\n'));
    assert.match(result3.violations[0]?.message ?? '', /冒頭にない/);
  });

  it('[TST-308] info の逃げ: Mermaid・mermaidjs・mermaid-x は図ではない (違反 D2)', () => {
    for (const info of ['Mermaid', 'mermaidjs', 'mermaid-x']) {
      const result = check('operations', [`\`\`\`${info}`, 'flowchart TB', '  A --> B', '```', '', ...TABLE]);
      assert.equal(result.violations.length, 1, info);
      assert.match(result.violations[0]?.message ?? '', /^図が無い/, info);
    }
  });

  it('[TST-309] 先頭の図で足りる: 冒頭域に許す図 + 文末にもう 1 枚 (別図種) → 違反 0 件', () => {
    assert.deepEqual(messages(check('operations', [...FLOW, ...TABLE, ...fence('pie', ['  "a" : 1'])])), []);
  });

  it('[TST-310] kind の逃げ: kind を消し置き場所も別の型にする / 置き場所と別の kind を書く → D は何も出ない (置き場所の検査が違反にする)', () => {
    const root = makeRoot();
    write(root, 'person/README.md', ['# person']);
    write(root, 'person/design/shared/09-x.md', doc(null, TABLE));
    write(root, 'person/design/shared/10-y.md', doc('adr', TABLE));
    assert.deepEqual(diagramViolation(runCheck(root)), []);
  });

  it('[TST-311] 薄い図: flowchart TB と node 1 つだけ → 違反 0 件 (既知の見逃し。薄さは承認のときに人が見る)', () => {
    assert.deepEqual(messages(check('operations', [...fence('flowchart TB', ['  A']), ...TABLE])), []);
  });

  it('[TST-312] 文章の逃がし: 図の中の %% 行・node の名前の長文は違反 0 件。bodyLines が 41 行以上のときだけ D4 の警告 (既知の見逃し)', () => {
    const longName = `  A["${'あ'.repeat(5_000)}"] --> B`;
    const result = check('operations', [...fence('flowchart TB', [longName, ...Array.from({ length: 10 }, (_, i) => `  %% ${'い'.repeat(500)} ${i}`)]), ...TABLE]);
    assert.deepEqual([result.violations, result.warnings], [[], []]);
    const many = check('operations', [...fence('flowchart TB', ['  A --> B', ...Array.from({ length: 40 }, () => '  %% 注釈')]), ...TABLE]);
    assert.equal(many.violations.length, 0);
    assert.equal(many.warnings.length, 1);
  });

  it('[TST-313] 図で行数を稼ぐ: 図を足して ○ の kind が 101 行になる → 03 の P6 が違反 (図を理由に上限を緩めない)', () => {
    const root = makeRoot();
    write(root, 'person/README.md', ['# person']);
    const body = [...FLOW, ...TABLE];
    const lines = doc('operations', body);
    write(root, PATHS['operations'] ?? '', [...lines, ...Array.from({ length: 101 - lines.length }, (_, i) => `補足 ${i}`)]);
    const result = runCheck(root);
    assert.equal(result.violations.length, 1, messages(result).join('\n'));
    assert.match(result.violations[0]?.message ?? '', /行数上限 \(100\) を超えている: 101 行/);
  });

  it('[TST-316] 指示の逃げ: %%{init: を開いて }%% で閉じない / --- の設定を閉じない → 違反 (D2「図種を読めない」)', () => {
    const cases: ReadonlyArray<readonly string[]> = [
      fence('%%{init: {"theme": "neutral"}', ['flowchart TB', '  A --> B']),
      fence('---', ['title: 例', 'flowchart TB', '  A --> B']),
    ];
    for (const figure of cases) {
      const result = check('operations', [...figure, ...TABLE]);
      assert.equal(result.violations.length, 1, figure.join('\n'));
      assert.match(result.violations[0]?.message ?? '', /図種を読めない/, figure.join('\n'));
    }
  });
});
