// node --test scripts/
// 実 templates/docs/ を一時ディレクトリへコピーして、doc 側だけを fixture で差し替えて検証する。
import { spawnSync } from 'node:child_process';
import { cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPTS_DIR, '..');
const SCRIPT = join(SCRIPTS_DIR, 'check-doc-template.mjs');
const workspaces = [];

/** 実 templates/docs/ にある kind 付きテンプレの枚数。件数を手で書くとテンプレ追加のたびに落ちる */
function templateKindCount() {
  const files = globSync('**/*.md', { cwd: join(REPO_ROOT, 'templates', 'docs') });
  return files.filter((file) => /^kind:\s*\S/m.test(readFileSync(join(REPO_ROOT, 'templates', 'docs', file), 'utf8')))
    .length;
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-doctpl-'));
  workspaces.push(root);
  cpSync(join(REPO_ROOT, 'templates', 'docs'), join(root, 'templates', 'docs'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  return root;
}

function writeDoc(root, relPath, content) {
  const target = join(root, 'docs', relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const check = (root, args = []) =>
  spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

// kind: function-list の必須節をすべて満たす最小 doc
function functionListDoc({
  related = '| 上流 (depends_on) | [要件定義書](../product/requirements.md) | REQ-001 |\n| 下流 | [画面設計](./screen-spec.md) | SCR-001 |',
  ids = 'FN-001',
  dependsOn = '[requirements]',
  sections = ['1. 機能一覧', '2. 機能別の状態・権限', '3. カバレッジ確認'],
  tldr = '> **TL;DR**: 最小の機能一覧。',
} = {}) {
  return [
    '---',
    'id: function-list',
    'title: 機能一覧',
    'kind: function-list',
    'arc42: 1',
    `depends_on: ${dependsOn}`,
    'relates_to: []',
    '---',
    '',
    '# 機能一覧',
    '',
    tldr,
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    related,
    '',
    ...sections.flatMap((section) => [`## ${section}`, '', `${ids} の内容`, '']),
  ].join('\n');
}

function requirementsDoc() {
  return [
    '---',
    'id: requirements',
    'kind: requirements',
    'arc42: 1',
    'depends_on: []',
    '---',
    '',
    '> **TL;DR**: 要件。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし (最上流) | — |',
    '| 下流 | [機能一覧](./function-list.md) | FN-001 |',
    '',
    ...['1. 業務要件', '2. 機能要件', '3. 制約', '4. 前提', '5. スコープ外'].flatMap((s) => [
      `## ${s}`,
      '',
      'REQ-001 の内容',
      '',
    ]),
  ].join('\n');
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('check-doc-template', () => {
  let root;
  beforeEach(() => {
    root = makeRoot();
  });

  it('テンプレの必須節を満たす doc は exit 0', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    const result = check(root);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, new RegExp(`OK {4}kind 登録 ${templateKindCount()} 種 / 検査 2 本`));
  });

  it('EARS 記法でない機能要件 (REQ-1xx) は exit 1', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 2. 機能要件\n\nREQ-001 の内容',
        ['## 2. 機能要件', '', '| ID | パターン | 要件文 |', '|---|---|---|', '| REQ-101 | Event | 利用者は予約できる |'].join('\n'),
      ),
    );
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /EARS 記法でない: REQ-101/);
  });

  it('EARS の義務形は「〜できなければならない」等の活用も通す', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 2. 機能要件\n\nREQ-001 の内容',
        ['## 2. 機能要件', '', '| ID | パターン | 要件文 |', '|---|---|---|',
          '| REQ-101 | Optional | 機能を有効にしている場合、システムは 0 円で引き換えられなければならない |'].join('\n'),
      ),
    );
    const result = check(root);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('arc42 章が kind の既定と食い違えば exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('arc42: 1', 'arc42: 5'));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /arc42 章が kind の既定と食い違う: frontmatter=5 \/ kind function-list の既定=1/);
  });

  it('--require-kind では design 系 kind の arc42 欠落が exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('arc42: 1\n', ''));
    assert.equal(check(root).status, 0, '--require-kind 無しでは欠落を落とさない');
    const strict = check(root, ['--require-kind']);
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(strict.stderr, /frontmatter に arc42 がない \(kind: function-list の既定は 1\)/);
  });

  it('arc42 章を持たない kind に arc42 を書いたら exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(
      root,
      'guides/x.md',
      ['---', 'id: guide-x', 'kind: guide', 'arc42: 5', 'depends_on: []', '---', '',
       '> **When to use**: x', '', '## 関連', '',
       '- **上流 (depends_on)**: なし', '- **下流**: 実装', ''].join('\n'),
    );
    const result = check(root, ['--require-kind']);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /arc42 章を持たない kind: guide/);
  });

  it('必須の H2 節が欠けたら exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc({ sections: ['1. 機能一覧', '3. カバレッジ確認'] }),
    );
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /必須の節がない: ## 機能別の状態・権限/);
  });

  it('「関連」節に下流が無ければ exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc({ related: '| 上流 (depends_on) | [要件定義書](../product/requirements.md) | REQ-001 |' }),
    );
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /「関連」節に下流の行がない/);
  });

  it('ID 接頭辞の桁が違えば exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ ids: 'FN-1' }));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /ID 形式が不正: FN-1/);
  });

  it('ID が 1 件も無ければ exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ ids: '(未記入)' }));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /FN-nnn の ID が 1 件もない/);
  });

  it('depends_on が存在しない id を指したら exit 1', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ dependsOn: '[requirements]' }));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /depends_on が存在しない id を指している: requirements/);
  });

  it('depends_on の external: は外部参照として許す', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ dependsOn: '[external:hearing-note]' }));
    const result = check(root);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('TL;DR が無ければ exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ tldr: '普通の段落。' }));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /TL;DR \/ When to use ブロックがない/);
  });

  it('未登録の kind は exit 1', () => {
    writeDoc(root, 'design/basic/x.md', '---\nid: x\nkind: unknown-kind\n---\n\n# x\n');
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /未登録の kind: unknown-kind/);
  });

  it('kind 未設定は既定では TODO、--require-kind で違反になる', () => {
    writeDoc(root, 'architecture/legacy.md', '---\nid: legacy\n---\n\n# 旧文書\n');
    const lenient = check(root);
    assert.equal(lenient.status, 0, lenient.stderr);
    assert.match(lenient.stdout, /TODO {2}docs\/architecture\/legacy\.md kind 未設定/);

    const strict = check(root, ['--require-kind']);
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(strict.stderr, /kind を決められない/);
  });

  it('domain-model は連番でなく code_root を必須にする', () => {
    const base = [
      '---',
      'id: domain-booking',
      'kind: domain-model',
      'depends_on: []',
      '---',
      '',
      '> **TL;DR**: booking。',
      '',
      '## 関連',
      '',
      '| 区分 | 文書 | 対応 ID |',
      '|---|---|---|',
      '| 上流 (depends_on) | なし | — |',
      '| 下流 | [テーブル定義](../../basic/tables/data-model.md) | TBL-001 |',
      '',
      ...['1. クラス図', '2. 不変条件', '3. クラス ↔ ファイル対応表', '4. 差し替え可能点 (port → Stage 1 既定)', '5. 他コンテキストとの関係', '6. 未決事項'].flatMap(
        (s) => [`## ${s}`, '', '内容', ''],
      ),
    ];
    writeDoc(root, 'design/detail/domain/booking.md', base.join('\n'));
    const missing = check(root);
    assert.equal(missing.status, 1, missing.stdout);
    assert.match(missing.stderr, /code_root がない/);

    base.splice(3, 0, 'code_root: apps/api/src/modules/booking');
    writeDoc(root, 'design/detail/domain/booking.md', base.join('\n'));
    const ok = check(root);
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  });

  it('frontmatter に kind が無くても置き場所から決まる', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const doc = functionListDoc().replace('kind: function-list\n', '');
    writeDoc(root, 'design/basic/function-list.md', doc);
    const result = check(root, ['--require-kind']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /kind 未設定 0 本/);
  });

  it('frontmatter の kind と置き場所が食い違えば exit 1', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('kind: function-list', 'kind: nonfunctional'));
    const result = check(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /kind と置き場所が食い違う: frontmatter=nonfunctional \/ 配置=function-list/);
  });

  it('「関連」節は箇条書き形式でもよい (ADR の 150 行対策)', () => {
    writeDoc(
      root,
      'adr/0001-x.md',
      [
        '---', 'id: adr-0001-x', 'kind: adr', 'arc42: 9', 'depends_on: []', '---', '',
        '> **TL;DR**: 決定。', '',
        '## 関連', '',
        '- **上流 (depends_on)**: なし', '- **下流**: 実装', '',
        ...['Status', 'Context', 'Decision Drivers', 'Decision', '却下した選択肢', 'Consequences', 'Confirmation', '再検討トリガ'].flatMap((x) => [`## ${x}`, '', '内容', '']),
      ].join('\n'),
    );
    const result = check(root, ['--require-kind']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  it('生成物 (AUTOGENERATED) は設計書として検査しない', () => {
    writeDoc(root, 'design/basic/function-list.md', '<!-- AUTOGENERATED BY scripts/x.mjs -->\n# 索引\n');
    const result = check(root, ['--require-kind']);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /検査 0 本/);
  });

  it('テンプレ置き場が無ければ exit 2 (検査不能)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'yatsu-doctpl-empty-'));
    workspaces.push(empty);
    mkdirSync(join(empty, 'docs'), { recursive: true });
    const result = check(empty);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /テンプレ置き場が無い/);
  });

  it('docs が無ければ exit 2', () => {
    rmSync(join(root, 'docs'), { recursive: true });
    const result = check(root);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /docs が無い/);
  });

  it('不明な引数は exit 2', () => {
    const result = check(root, ['--yolo']);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /不明な引数/);
  });
});
