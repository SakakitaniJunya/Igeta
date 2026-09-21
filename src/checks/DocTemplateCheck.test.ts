// node --test dist
// 実 templates/docs/ を一時ディレクトリへコピーして、doc 側だけを fixture で差し替えて検証する。
import { cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExitCode } from '../core/ExitCode.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { Report } from '../core/Report.js';
import { DocTemplateCheck, type DocTemplateOptions, type DocTemplateResult } from './DocTemplateCheck.js';

const workspaces: string[] = [];

/** 実 templates/docs/ にある kind 付きテンプレの枚数。件数を手で書くとテンプレ追加のたびに落ちる */
function templateKindCount(): number {
  const templates = join(IGETA_ROOT, 'templates', 'docs');
  return globSync('**/*.md', { cwd: templates }).filter((file) =>
    /^kind:\s*\S/m.test(readFileSync(join(templates, file), 'utf8')),
  ).length;
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-doctpl-'));
  workspaces.push(root);
  cpSync(join(IGETA_ROOT, 'templates', 'docs'), join(root, 'templates', 'docs'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  return root;
}

function writeDoc(root: string, relPath: string, content: string): void {
  const target = join(root, 'docs', relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/**
 * テンプレは igetaRoot 側から解決される。makeRoot() は実 templates/docs をコピーするので、
 * 既定では igetaRoot = targetRoot として元スクリプトの --root 1 本と同じ形にする。
 */
function check(
  root: string,
  options: DocTemplateOptions = {},
  igetaRoot: string = root,
): { result: DocTemplateResult; report: Report } {
  const result = new DocTemplateCheck(options).analyze({ targetRoot: root, igetaRoot });
  const report = new Report();
  report.addAll(result.violations);
  return { result, report };
}

interface FunctionListDocOptions {
  readonly related?: string;
  readonly ids?: string;
  readonly dependsOn?: string;
  readonly sections?: readonly string[];
  readonly tldr?: string;
}

// kind: function-list の必須節をすべて満たす最小 doc
function functionListDoc({
  related = '| 上流 (depends_on) | [要件定義書](../product/requirements.md) | REQ-001 |\n| 下流 | [画面設計](./screen-spec.md) | SCR-001 |',
  ids = 'FN-001',
  dependsOn = '[requirements]',
  sections = ['1. 機能一覧', '2. 機能別の状態・権限', '3. カバレッジ確認'],
  tldr = '> **TL;DR**: 最小の機能一覧。',
}: FunctionListDocOptions = {}): string {
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

function requirementsDoc(): string {
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

describe('DocTemplateCheck', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('テンプレの必須節を満たす doc は違反なし', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    const { result, report } = check(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.equal(result.kindCount, templateKindCount());
    assert.equal(result.checkedCount, 2);
  });

  it('EARS 記法でない機能要件 (REQ-1xx) は違反', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 2. 機能要件\n\nREQ-001 の内容',
        ['## 2. 機能要件', '', '| ID | パターン | 要件文 |', '|---|---|---|', '| REQ-101 | Event | 利用者は予約できる |'].join('\n'),
      ),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /EARS 記法でない: REQ-101/);
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
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('arc42 章が kind の既定と食い違えば違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('arc42: 1', 'arc42: 5'));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /arc42 章が kind の既定と食い違う: frontmatter=5 \/ kind function-list の既定=1/);
  });

  it('requireKind では design 系 kind の arc42 欠落が違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('arc42: 1\n', ''));
    assert.equal(check(root).report.exitCode, ExitCode.Ok, 'requireKind 無しでは欠落を落とさない');
    const strict = check(root, { requireKind: true });
    assert.equal(strict.report.exitCode, ExitCode.Violation);
    assert.match(strict.report.format(), /frontmatter に arc42 がない \(kind: function-list の既定は 1\)/);
  });

  it('arc42 章を持たない kind に arc42 を書いたら違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(
      root,
      'guides/x.md',
      ['---', 'id: guide-x', 'kind: guide', 'arc42: 5', 'depends_on: []', '---', '',
       '> **When to use**: x', '', '## 関連', '',
       '- **上流 (depends_on)**: なし', '- **下流**: 実装', ''].join('\n'),
    );
    const { report } = check(root, { requireKind: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /arc42 章を持たない kind: guide/);
  });

  it('必須の H2 節が欠けたら違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc({ sections: ['1. 機能一覧', '3. カバレッジ確認'] }),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /必須の節がない: ## 機能別の状態・権限/);
  });

  it('「関連」節に下流が無ければ違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc({ related: '| 上流 (depends_on) | [要件定義書](../product/requirements.md) | REQ-001 |' }),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /「関連」節に下流の行がない/);
  });

  it('ID 接頭辞の桁が違えば違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ ids: 'FN-1' }));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /ID 形式が不正: FN-1/);
  });

  it('ID が 1 件も無ければ違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ ids: '(未記入)' }));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /FN-nnn の ID が 1 件もない/);
  });

  it('depends_on が存在しない id を指したら違反', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ dependsOn: '[requirements]' }));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /depends_on が存在しない id を指している: requirements/);
  });

  it('depends_on の external: は外部参照として許す', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ dependsOn: '[external:hearing-note]' }));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('TL;DR が無ければ違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc({ tldr: '普通の段落。' }));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /TL;DR \/ When to use ブロックがない/);
  });

  it('未登録の kind は違反', () => {
    writeDoc(root, 'design/basic/x.md', '---\nid: x\nkind: unknown-kind\n---\n\n# x\n');
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /未登録の kind: unknown-kind/);
  });

  it('kind 未設定は既定では未管理扱い、requireKind で違反になる', () => {
    writeDoc(root, 'architecture/legacy.md', '---\nid: legacy\n---\n\n# 旧文書\n');
    const lenient = check(root);
    assert.equal(lenient.report.exitCode, ExitCode.Ok, lenient.report.format());
    assert.deepEqual(lenient.result.unmanaged, [join('docs', 'architecture', 'legacy.md')]);

    const strict = check(root, { requireKind: true });
    assert.equal(strict.report.exitCode, ExitCode.Violation);
    assert.match(strict.report.format(), /kind を決められない/);
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
    assert.equal(missing.report.exitCode, ExitCode.Violation);
    assert.match(missing.report.format(), /code_root がない/);

    base.splice(3, 0, 'code_root: apps/api/src/modules/booking');
    writeDoc(root, 'design/detail/domain/booking.md', base.join('\n'));
    const ok = check(root);
    assert.equal(ok.report.exitCode, ExitCode.Ok, ok.report.format());
  });

  it('frontmatter に kind が無くても置き場所から決まる', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('kind: function-list\n', ''));
    const { result, report } = check(root, { requireKind: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.equal(result.unmanaged.length, 0);
  });

  it('ファイル名の連番 (NN-) は種類の判定で無視する (テンプレと番号が違ってもよい)', () => {
    writeDoc(root, 'product/01-requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/99-function-list.md', functionListDoc().replace('kind: function-list\n', ''));
    const { result, report } = check(root, { requireKind: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.equal(result.unmanaged.length, 0);
  });

  it('frontmatter の kind と置き場所が食い違えば違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc().replace('kind: function-list', 'kind: nonfunctional'));
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /kind と置き場所が食い違う: frontmatter=nonfunctional \/ 配置=function-list/);
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
    const { report } = check(root, { requireKind: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('生成物 (AUTOGENERATED) は設計書として検査しない', () => {
    writeDoc(root, 'design/basic/function-list.md', '<!-- AUTOGENERATED BY scripts/x.mjs -->\n# 索引\n');
    const { result, report } = check(root, { requireKind: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.equal(result.checkedCount, 0);
  });

  it('テンプレ置き場が無ければ検査不能 (exit 2)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'yatsu-doctpl-empty-'));
    workspaces.push(empty);
    mkdirSync(join(empty, 'docs'), { recursive: true });
    const { report } = check(empty);
    assert.equal(report.exitCode, ExitCode.CannotCheck);
    assert.match(report.format(), /テンプレ置き場が無い/);
  });

  it('docs が無ければ検査不能 (exit 2)', () => {
    rmSync(join(root, 'docs'), { recursive: true });
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.CannotCheck);
    assert.match(report.format(), /docs が無い/);
  });

  it('不正な設定 (存在しないディレクトリ指定) は検査不能 (exit 2)', () => {
    // 引数解析は CLI 層へ移したので、クラス側の設定不正はこの形で現れる
    const { report } = check(root, { docsDir: join(root, 'nope') });
    assert.equal(report.exitCode, ExitCode.CannotCheck);
    assert.match(report.format(), /docs が無い/);
  });

  it('テンプレは igetaRoot 側から解決する (targetRoot に templates/ が無くてもよい)', () => {
    const bare = mkdtempSync(join(tmpdir(), 'yatsu-doctpl-bare-'));
    workspaces.push(bare);
    mkdirSync(join(bare, 'docs'), { recursive: true });
    writeDoc(bare, 'product/requirements.md', requirementsDoc());
    writeDoc(bare, 'design/basic/function-list.md', functionListDoc());
    const { result, report } = check(bare, {}, IGETA_ROOT);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.equal(result.kindCount, templateKindCount());
    assert.equal(result.checkedCount, 2);
  });
});
