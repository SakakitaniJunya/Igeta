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
    // ID の「定義」は行頭セル (`| FN-001 | ... |`) だけを数える (code-reviewer 実バグ #3/#7)。
    // テスト fixture も実テンプレと同じ表形式にする (本文の平文言及とは区別して検証するため)。
    ...sections.flatMap((section) => [`## ${section}`, '', `| ${ids} | 内容 |`, '']),
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
    // ID の「定義」は行頭セル (`| REQ-001 | ... |`) だけを数える (code-reviewer 実バグ #3/#7)。
    // テスト fixture も実テンプレと同じ表形式にする。
    ...['1. 業務要件', '2. 機能要件', '3. 制約', '4. 前提', '5. スコープ外'].flatMap((s) => [
      `## ${s}`,
      '',
      '| REQ-001 | 内容 |',
      '',
    ]),
  ].join('\n');
}

interface ContextMapDocOptions {
  readonly id?: string;
  readonly context?: string;
  readonly briefLink?: string;
}

// kind: context-map の必須節をすべて満たす最小 doc (templates/docs/contexts/maps/__context__.md 相当)
function contextMapDoc({ id = 'reservation-map', context = 'reservation', briefLink = 'なし' }: ContextMapDocOptions = {}): string {
  return [
    '---',
    `id: ${id}`,
    'kind: context-map',
    `context: ${context}`,
    'line_limit: 150',
    'depends_on: [map]',
    'relates_to: []',
    '---',
    '',
    '> **TL;DR**: テスト。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | [全体の地図](./00-map.md) | — |',
    '| 下流 | feature-brief 全部 | — |',
    '',
    ...['1. 概要', '2. 含む機能'].flatMap((s) => [`## ${s}`, '', 'x', '']),
    '## 3. 隣接まとまりへの入口',
    '',
    briefLink === 'なし' ? 'x' : briefLink,
    '',
  ].join('\n');
}

interface FeatureBriefDocOptions {
  readonly id?: string;
  /** null なら context フィールド自体を省く (未割り当てのテスト用) */
  readonly context?: string | null;
}

// kind: feature-brief の必須節をすべて満たす最小 doc (templates/docs/product/features/__feature__.md 相当)
function featureBriefDoc({ id = 'reservation-flow', context = 'reservation' }: FeatureBriefDocOptions = {}): string {
  return [
    '---',
    `id: ${id}`,
    'kind: feature-brief',
    ...(context === null ? [] : [`context: ${context}`]),
    'depends_on: []',
    '---',
    '',
    '> **TL;DR**: テスト。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | [地図](../../00-map.md) | — |',
    '| 下流 | 関わる REQ ID | REQ-* |',
    '',
    '## 1. WHAT/WHY',
    '',
    'x',
    '',
    '## 2. ユーザーストーリー',
    '',
    '| 優先度 | ストーリー | 単独で試せる | Given | When | Then |',
    '|---|---|---|---|---|---|',
    '',
    '## 3. 対象外',
    '',
    '- x',
    '',
    '## 4. 関わる REQ ID',
    '',
    '- x',
    '',
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
        '## 2. 機能要件\n\n| REQ-001 | 内容 |',
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
        '## 2. 機能要件\n\n| REQ-001 | 内容 |',
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

  it('プレースホルダ表記 PREFIX-nnn (小文字 nnn) は ID 形式違反に数えない (code-reviewer 実バグ #4)', () => {
    // 実テンプレそのものの書き方: 冒頭の HTML コメントと TL;DR で「DEC-nnn」「OPEN-nnn」を
    // この接頭辞の ID 一般を指す説明用の記法として使う (実際の ID ではない)。
    writeDoc(
      root,
      '01-decisions.md',
      [
        '---',
        'id: decisions',
        'title: 決定台帳',
        'kind: decision-log',
        'id_prefixes: [DEC, OPEN]',
        'status: active',
        'canonical: true',
        'owners: [product]',
        'created: 2026-09-30',
        'depends_on: []',
        'relates_to: [map]',
        '---',
        '',
        '<!--',
        '  検査: 他文書で「CEO が決定」等の帰属を主張するなら DEC-nnn を、「仮置き」と書くなら OPEN-nnn を',
        '  この台帳に実在させる (igeta template-check --require-human-review)。',
        '-->',
        '',
        '# 決定台帳',
        '',
        '> **TL;DR**: 決めたこと・まだ決めていないことの一覧。仮置きの値は全部 OPEN-nnn を持つ。',
        '',
        '## 関連',
        '',
        '| 区分 | 文書 | 対応 ID |',
        '|---|---|---|',
        '| 上流 (depends_on) | なし | — |',
        '| 下流 | なし | — |',
        '',
        '## 1. 決定 (DEC)',
        '',
        '| ID | 日付 | 決めた人 | 原文 | 決定 | 影響する文書 |',
        '|---|---|---|---|---|---|',
        '| DEC-001 | 2026-09-29 | CEO | 青色でいく | 青色申告を継続する | requirements.md |',
        '',
        '## 2. 未決 (OPEN)',
        '',
        '| ID | 論点 | 推奨案 | 仮置き値 | 影響する文書 |',
        '|---|---|---|---|---|',
        '| OPEN-001 | 猶予日数 | 30日 | 30日 | requirements.md |',
        '',
        '## 3. 仮置き一覧 (自動生成)',
        '',
        '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
        '<!-- AUTOGEN:tentative-index:end -->',
        '',
      ].join('\n'),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('プレースホルダ (nnn) と実際の ID 形式違反は区別する (code-reviewer 実バグ #4、負例)', () => {
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc().replace(
        '> **TL;DR**: テスト。',
        '> **TL;DR**: テスト。プレースホルダは OPEN-nnn だが、DEC-1 は本物の ID として桁が違う。',
      ),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /ID 形式が不正: DEC-1 /);
  });

  it('AUTOGEN 区間に写された行の ID 形式は責めない (code-reviewer 実バグ #4)', () => {
    // docs-graph --write が「仮置き一覧」に他文書の行をそのまま写す。その行に桁が違う DEC/OPEN
    // 風の文字列が写っていても、決定台帳自身がその形式で書いたわけではないので責めない。
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc().replace(
        '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->\n<!-- AUTOGEN:tentative-index:end -->',
        [
          '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
          '| OPEN | 場所 | 本文 |',
          '|---|---|---|',
          '| **(無し)** | [product/other.md:9](product/other.md#L9) | 参照コード DEC-x が例示として書かれていた |',
          '<!-- AUTOGEN:tentative-index:end -->',
        ].join('\n'),
      ),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
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

  it('frontmatter id の重複は template-check 単体でも違反にする (non-blocking N2)', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    writeDoc(root, 'design/basic/function-list-2.md', functionListDoc());
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /frontmatter id が重複している: function-list \(.*function-list-2\.md, .*function-list\.md\)/);
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

// kind: map の必須節をすべて満たす最小 doc。requirements への本文リンクは呼び出し側で差し替える
function mapDoc({ requirementsLink = '[要件定義書](./product/requirements.md)' }: { requirementsLink?: string } = {}): string {
  return [
    '---',
    'id: map',
    'title: 地図',
    'kind: map',
    'status: draft',
    'canonical: true',
    'owners: [product]',
    'created: 2026-09-30',
    'line_limit: 150',
    'depends_on: []',
    'relates_to: [decisions]',
    '---',
    '',
    '# 地図',
    '',
    '> **TL;DR**: テスト。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし | — |',
    `| 下流 | [決定台帳](./01-decisions.md) / ${requirementsLink} | — |`,
    '',
    ...['1. 何を作るか', '2. 誰が使うか', '3. 主要フロー', '4. やらないこと', '5. 詳細への入口'].flatMap((s) => [
      `## ${s}`,
      '',
      'x',
      '',
    ]),
  ].join('\n');
}

interface DecisionLogDocOptions {
  readonly decRows?: string;
  readonly openRows?: string;
}

// kind: decision-log の必須節をすべて満たす最小 doc
function decisionLogDoc({
  decRows = '| DEC-001 | 2026-09-29 | CEO | 青色でいく | 青色申告を継続する | requirements.md |',
  openRows = '| OPEN-001 | 猶予日数 | 30日 | 30日 | requirements.md |',
}: DecisionLogDocOptions = {}): string {
  return [
    '---',
    'id: decisions',
    'title: 決定台帳',
    'kind: decision-log',
    'id_prefixes: [DEC, OPEN]',
    'status: active',
    'canonical: true',
    'owners: [product]',
    'created: 2026-09-30',
    'depends_on: []',
    'relates_to: [map]',
    '---',
    '',
    '# 決定台帳',
    '',
    '> **TL;DR**: テスト。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし | — |',
    '| 下流 | なし | — |',
    '',
    '## 1. 決定 (DEC)',
    '',
    '| ID | 日付 | 決めた人 | 原文 | 決定 | 影響する文書 |',
    '|---|---|---|---|---|---|',
    decRows,
    '',
    '## 2. 未決 (OPEN)',
    '',
    '| ID | 論点 | 推奨案 | 仮置き値 | 影響する文書 |',
    '|---|---|---|---|---|',
    openRows,
    '',
    '## 3. 仮置き一覧 (自動生成)',
    '',
    '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
    '<!-- AUTOGEN:tentative-index:end -->',
    '',
  ].join('\n');
}

describe('DocTemplateCheck の人間レビュー層 (requireHumanReview)', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('地図・決定台帳・要件定義・機能一覧が揃っていれば違反なし', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定台帳: DEC/OPEN 行の必須列が空欄なら違反 (requireHumanReview 不要、non-blocking N1)', () => {
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc({
        decRows: '| DEC-001 | | CEO | | 青色申告を継続する | requirements.md |',
        openRows: '| OPEN-001 | | 30日 | | requirements.md |',
      }),
    );
    const { report } = check(root);
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /DEC-001 の「日付」列が空欄/);
    assert.match(report.format(), /DEC-001 の「原文」列が空欄/);
    assert.match(report.format(), /OPEN-001 の「論点」列が空欄/);
    assert.match(report.format(), /OPEN-001 の「仮置き値」列が空欄/);
    assert.doesNotMatch(report.format(), /「決めた人」列が空欄/);
  });

  it('requireHumanReview 無しでは地図の網羅・決定の帰属・修飾 ID を検査しない (既存プロジェクトを赤くしない)', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root); // 00-map.md も 01-decisions.md も無い
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('行数上限 (line_limit) を超えたら違反', () => {
    const padding = Array.from({ length: 160 }, () => '- 埋め草').join('\n');
    writeDoc(root, '00-map.md', mapDoc().replace('## 4. やらないこと\n\nx', `## 4. やらないこと\n\n${padding}`));
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /行数上限 \(150\) を超えている/);
  });

  it('地図の網羅: requirements 文書が 00-map.md からリンクされていなければ違反', () => {
    writeDoc(root, '00-map.md', mapDoc({ requirementsLink: 'なし' }));
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /requirements 文書が 00-map\.md からリンクされていない: docs[\\/]product[\\/]requirements\.md/);
  });

  it('地図の網羅: requirements 文書があるのに 00-map.md が無ければ違反', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /00-map\.md が無い/);
  });

  it('地図の網羅の2段化 (a): まとまりの地図が無ければ何も起きない (既存案件を赤くしない)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('地図の網羅の2段化 (a): まとまりの地図が 00-map.md からリンクされていなければ違反', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'contexts/maps/reservation.md', contextMapDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(
      report.format(),
      /まとまりの地図が 00-map\.md からリンクされていない: docs[\\/]contexts[\\/]maps[\\/]reservation\.md/,
    );
  });

  it('地図の網羅の2段化 (a): 00-map.md からリンクしていれば通る', () => {
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace('## 5. 詳細への入口\n\nx', '## 5. 詳細への入口\n\n[予約まとまりの地図](./contexts/maps/reservation.md)'),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'contexts/maps/reservation.md', contextMapDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('地図の網羅の2段化 (b): まとまりの地図が自分の feature-brief をリンクしていなければ違反、リンクすれば通る', () => {
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace('## 5. 詳細への入口\n\nx', '## 5. 詳細への入口\n\n[予約まとまりの地図](./contexts/maps/reservation.md)'),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'contexts/maps/reservation.md', contextMapDoc());
    writeDoc(root, 'product/features/reservation-flow.md', featureBriefDoc());
    const missing = check(root, { requireHumanReview: true });
    assert.equal(missing.report.exitCode, ExitCode.Violation, missing.report.format());
    assert.match(
      missing.report.format(),
      /feature-brief がまとまりの地図からリンクされていない: docs[\\/]product[\\/]features[\\/]reservation-flow\.md/,
    );

    writeDoc(
      root,
      'contexts/maps/reservation.md',
      contextMapDoc({ briefLink: '[予約の受付](../../product/features/reservation-flow.md)' }),
    );
    const ok = check(root, { requireHumanReview: true });
    assert.equal(ok.report.exitCode, ExitCode.Ok, ok.report.format());
  });

  it('地図の網羅の2段化 (b): 別のまとまりの feature-brief は数えない', () => {
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace('## 5. 詳細への入口\n\nx', '## 5. 詳細への入口\n\n[予約まとまりの地図](./contexts/maps/reservation.md)'),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'contexts/maps/reservation.md', contextMapDoc());
    writeDoc(root, 'product/features/payment-flow.md', featureBriefDoc({ id: 'payment-flow', context: 'payment' }));
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('地図の網羅の2段化 (b): context 無記入の feature-brief は「未割り当て」として違反にする (まとまりの地図が 1 枚以上あるとき、code-reviewer round 1 non-blocking 3)', () => {
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace('## 5. 詳細への入口\n\nx', '## 5. 詳細への入口\n\n[予約まとまりの地図](./contexts/maps/reservation.md)'),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'contexts/maps/reservation.md', contextMapDoc());
    writeDoc(root, 'product/features/unassigned-flow.md', featureBriefDoc({ id: 'unassigned-flow', context: null }));
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /未割り当て: feature-brief に context が無記入/);
    assert.match(report.format(), /product[\\/]features[\\/]unassigned-flow\.md/);
  });

  it('地図の網羅の2段化 (b): まとまりの地図が 1 枚も無ければ context 無記入の feature-brief でも違反にしない (既存案件を赤くしない)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'product/features/unassigned-flow.md', featureBriefDoc({ id: 'unassigned-flow', context: null }));
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属: 「CEO が決定」等の表記に DEC-nnn が無ければ違反', () => {
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('> **TL;DR**: 要件。', '> **TL;DR**: 要件。CEO が決定した内容。'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /決定の帰属を主張しているが DEC-nnn の参照が無い/);
  });

  it('決定の帰属: DEC-nnn を書いても台帳に無ければ違反', () => {
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('> **TL;DR**: 要件。', '> **TL;DR**: 要件。CEO が決定した (DEC-999)。'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /DEC-999 が決定台帳に無い/);
  });

  it('前提修正: 日付入り決定 ID (DEC-20260917-02) の先頭 3 桁が実在の DEC-nnn へ部分一致しない (誤検出防止)', () => {
    // DEC-202 を本物の決定として台帳に登録した状態で、別文書が日付入りの原文表記
    // (DEC-20260917-02、移行元案件の旧 ID 形式) を引用しても「DEC-202 への言及」と誤認してはいけない。
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc({ decRows: '| DEC-202 | 2026-09-17 | CEO | 青色でいく | 青色申告を継続する | requirements.md |' }),
    );
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('> **TL;DR**: 要件。', '> **TL;DR**: 要件。CEO が決定した (DEC-20260917-02)。'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /決定の帰属を主張しているが DEC-nnn の参照が無い/);
    assert.doesNotMatch(report.format(), /DEC-202 が決定台帳に無い/);
  });

  it('決定の帰属: kind: adr 自身は除外する (code-reviewer B1、ADR の Decision 節を誤検出しない)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'adr/0001-x.md',
      [
        '---', 'id: adr-0001-x', 'kind: adr', 'arc42: 9', 'depends_on: []', '---', '',
        '> **TL;DR**: 決定。', '',
        '## 関連', '',
        '- **上流 (depends_on)**: なし', '- **下流**: 実装', '',
        ...['Status', 'Context', 'Decision Drivers', 'Decision', '却下した選択肢', 'Consequences', 'Confirmation', '再検討トリガ'].flatMap(
          (x) => [`## ${x}`, '', x === 'Decision' ? 'CEO が決定した内容。仮置きの値も含む (暫定 30 日)。' : '内容', ''],
        ),
      ].join('\n'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('実 templates/docs/01-decisions.md を無編集で置いても違反にならない (code-reviewer 実バグ #4)', () => {
    // スキャフォールド直後 (まだ 1 件も決定・仮置きを記録していない) の状態を再現する。
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', readFileSync(join(IGETA_ROOT, 'templates', 'docs', '01-decisions.md'), 'utf8'));
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属: kind: human-review (この仕組み自身を解説するガイド) は除外する (code-reviewer 実バグ #5)', () => {
    // 実 templates/docs/guides/03-human-review.md をそのまま (無編集で) docs/ へ置く。このガイドは
    // 「OPEN-nnn」「DEC-nnn」という記法自体を解説する文書で、実在の決定・仮置きへの言及ではない。
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'guides/01-document-taxonomy.md',
      readFileSync(join(IGETA_ROOT, 'templates', 'docs', 'guides', '01-document-taxonomy.md'), 'utf8'),
    );
    writeDoc(
      root,
      'guides/03-human-review.md',
      readFileSync(join(IGETA_ROOT, 'templates', 'docs', 'guides', '03-human-review.md'), 'utf8'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属・仮置き: HTML コメント内の記述は検査対象外にする (code-reviewer 実バグ #5)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '| REQ-001 | 内容 |',
        [
          '| REQ-001 | 内容 |',
          '',
          '<!--',
          '  著者向けの注記: CEO が決定した内容の例をここに書く予定。仮置きで30日とする例も足す。',
          '-->',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属: 引用「」内の帰属主張・否定・伝聞は除外する (code-reviewer B2)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        [
          '出典を「CEO 決定」から「欠落レビューで発見」に訂正 (引用は主張ではない)。',
          'これは CEO が決定ではない (否定は主張ではない)。',
          '会話ログでは CEO が決定したと書かれていた (伝聞は主張ではない)。',
          '',
          '## 5. スコープ外',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属: 否定の decoy を先に置いても後続の本物の主張を見逃さない (code-reviewer round 3 C2)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        [
          'CEOが決定ではないという説もあるが、実務上はCEOが決定した。',
          '',
          '## 5. スコープ外',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /決定の帰属を主張しているが DEC-nnn の参照が無い/);
  });

  it('決定の帰属: 無生物主語の「〜が決定」は誤検出しない (code-reviewer 実バグ #6)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        [
          '価格が決定されるまでは仮の値を使う (人が決めたわけではない)。',
          '日程が決定次第、関係者へ通知する。',
          '',
          '## 5. スコープ外',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属: 「〜さんが決定」は人が主語なので検出する (code-reviewer 実バグ #6、正例)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        ['田中さんが決定した内容をここに反映する。', '', '## 5. スコープ外'].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /決定の帰属を主張しているが DEC-nnn の参照が無い/);
  });

  it('仮置き: OPEN-nnn の参照が無ければ違反、書けば通る', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('| REQ-001 | 内容 |', '| REQ-001 | 内容 |\n\n仮置きで30日とする。'),
    );
    const missing = check(root, { requireHumanReview: true });
    assert.equal(missing.report.exitCode, ExitCode.Violation);
    assert.match(missing.report.format(), /「仮置き」に OPEN-nnn の参照が無い/);

    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('| REQ-001 | 内容 |', '| REQ-001 | 内容 |\n\n仮置きで decisions/OPEN-001 の30日とする。'),
    );
    const ok = check(root, { requireHumanReview: true });
    assert.equal(ok.report.exitCode, ExitCode.Ok, ok.report.format());
  });

  it('前提修正: 日付入り未決 ID (OPEN-20260917-02) の先頭 3 桁が実在の OPEN-nnn へ部分一致しない (誤検出防止)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc({ openRows: '| OPEN-202 | 猶予日数 | 30日 | 30日 | requirements.md |' }),
    );
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('| REQ-001 | 内容 |', '| REQ-001 | 内容 |\n\n仮置きで30日とする (OPEN-20260917-02)。'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /「仮置き」に OPEN-nnn の参照が無い/);
    assert.doesNotMatch(report.format(), /OPEN-202 が決定台帳に無い/);
  });

  it('仮置き: AUTOGEN の仮置き一覧 (索引) にしか無い OPEN は「決定台帳に無い」扱いになる (code-reviewer 実バグ #3)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    // §2 (未決 OPEN) には本物の定義が無いが、§3 の AUTOGEN 索引には OPEN-005 の行がある。この索引は
    // 「仮置きマークがどこにあるか」を igeta docs-graph --write が集めて貼るだけで、§2 に本物の
    // OPEN-005 の行を追加したわけではない。索引の行を「定義」と誤認すると、この違反が消えてしまう。
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc().replace(
        '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->\n<!-- AUTOGEN:tentative-index:end -->',
        [
          '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
          '| OPEN | 場所 | 本文 |',
          '|---|---|---|',
          '| OPEN-005 | [product/02-tenancy.md:40](product/02-tenancy.md#L40) | 仮置きの値 (OPEN-005) |',
          '<!-- AUTOGEN:tentative-index:end -->',
        ].join('\n'),
      ),
    );
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('| REQ-001 | 内容 |', '| REQ-001 | 内容 |\n\n仮置きで decisions/OPEN-005 の30日とする。'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /OPEN-005 が決定台帳に無い/);
  });

  it('仮置き: 引用「」内・否定・伝聞は除外する (code-reviewer B2)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        [
          '前版は「仮置き」と書かれていたが、正式値に更新した (引用は主張ではない)。',
          'この値は仮置きではない (否定は主張ではない)。',
          'メモには 30 日を仮置きしたと書かれていた (伝聞は主張ではない)。',
          '',
          '## 5. スコープ外',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('仮置き: 否定の decoy を先に置いても後続の本物の仮置きを見逃さない (code-reviewer round 3 C2)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace(
        '## 5. スコープ外',
        [
          '前者は仮置きではないが、後者は仮置きで30日とする。',
          '',
          '## 5. スコープ外',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /「仮置き」に OPEN-nnn の参照が無い/);
  });

  it('修飾 ID: 他ファイルの ID を裸で参照したら違反、<doc-id>/PREFIX-nnn で参照すれば通る', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc().replace('## 5. スコープ外', '同一ファイル内は裸で OK: REQ-001。\n\n## 5. スコープ外'),
    );
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '他ファイルの REQ-001 を裸で参照。\n\n## 3. カバレッジ確認'),
    );
    const bare = check(root, { requireHumanReview: true });
    assert.equal(bare.report.exitCode, ExitCode.Violation);
    assert.match(bare.report.format(), /他ファイルの ID は修飾 ID \(<doc-id>\/REQ-001\) で参照する/);

    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '他ファイルの requirements/REQ-001 を修飾 ID で参照。\n\n## 3. カバレッジ確認'),
    );
    const qualified = check(root, { requireHumanReview: true });
    assert.equal(qualified.report.exitCode, ExitCode.Ok, qualified.report.format());
  });

  it('修飾 ID: doc id が存在しない修飾 ID は違反', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '存在しない nope/REQ-001 を参照。\n\n## 3. カバレッジ確認'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /修飾 ID が解決できない: nope\/REQ-001 \(doc id "nope" が存在しない\)/);
  });

  it('修飾 ID: 番号が複数ファイルのローカル採番で重複していても、それ自体は違反にしない (修飾すれば解決する)', () => {
    writeDoc(
      root,
      '00-map.md',
      mapDoc({ requirementsLink: '[要件A](./product/requirements.md) / [要件B](./product/requirements-b.md)' }),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'product/requirements-b.md', requirementsDoc().replace('id: requirements', 'id: requirements-b'));
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '裸参照: REQ-001。\n\n## 3. カバレッジ確認'),
    );
    const bare = check(root, { requireHumanReview: true });
    assert.equal(bare.report.exitCode, ExitCode.Violation);
    assert.match(bare.report.format(), /他ファイルの ID は修飾 ID で参照する: REQ-001 は複数の文書のローカル採番/);
    assert.doesNotMatch(bare.report.format(), /振り直す|統合する/); // 番号の重複そのものは違反にしない (各ファイルの正常なローカル採番)

    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '修飾参照: requirements-b/REQ-001。\n\n## 3. カバレッジ確認'),
    );
    const qualified = check(root, { requireHumanReview: true });
    assert.equal(qualified.report.exitCode, ExitCode.Ok, qualified.report.format());
  });

  it('修飾 ID: 空白区切りの疑似修飾 (`09-auth REQ-128`) は広義の修飾済みとして扱う (code-reviewer round 3 C1)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '空白区切りの疑似修飾: requirements REQ-001 を参照。\n\n## 3. カバレッジ確認'),
    );
    const { report, result } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
    assert.deepEqual(result.unambiguousFixes, []); // 既に広義の修飾済みなので fix-ids の対象にもしない
  });

  it('修飾 ID: frontmatter id とファイル名 stem が食い違うとき、修飾は id を使う (code-reviewer round 3 C4)', () => {
    // main の再現 fixture: frontmatter id は tenancy だが、ファイル名は連番付き 02-tenancy.md
    writeDoc(
      root,
      '00-map.md',
      mapDoc({ requirementsLink: '[要件定義書](./product/requirements.md) / [tenancy](./product/02-tenancy.md)' }),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'product/02-tenancy.md', requirementsDoc().replace('id: requirements', 'id: tenancy').replace(/REQ-001/g, 'REQ-114'));
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace(
        '## 3. カバレッジ確認',
        'FN-001 tenancy REQ-114 と REQ-114 の両方を参照。\n\n## 3. カバレッジ確認',
      ),
    );
    const { report, result } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    // 裸の 2 回目の出現だけが違反になり、メッセージは id (tenancy) を使う。stem (02-tenancy) では書かない
    assert.match(report.format(), /他ファイルの ID は修飾 ID \(<doc-id>\/REQ-114\) で参照する: REQ-114 は .*02-tenancy\.md 由来 \(例: tenancy\/REQ-114\)/);
    assert.doesNotMatch(report.format(), /例: 02-tenancy\/REQ-114/);
    const fix = result.unambiguousFixes.find((f) => f.token === 'REQ-114');
    assert.ok(fix, JSON.stringify(result.unambiguousFixes));
    assert.equal(fix?.homeId, 'tenancy');
  });

  it('修飾 ID: 定義元の doc に frontmatter id が無ければ fix-ids の対象から外す (code-reviewer 実バグ #4)', () => {
    // product/02-tenancy.md は kind: requirements だが id を持たない (id 未記入のまま運用してしまった場合)
    writeDoc(
      root,
      '00-map.md',
      mapDoc({ requirementsLink: '[要件定義書](./product/requirements.md) / [tenancy](./product/02-tenancy.md)' }),
    );
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'product/02-tenancy.md',
      requirementsDoc().replace('id: requirements\n', '').replace(/REQ-001/g, 'REQ-301'),
    );
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '他ファイルの REQ-301 を裸で参照。\n\n## 3. カバレッジ確認'),
    );
    const { report, result } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(
      report.format(),
      /他ファイルの ID は修飾 ID \(<doc-id>\/REQ-301\) で参照する: REQ-301 は .*02-tenancy\.md 由来。.*id を付けてから修飾する \(fix-ids の対象外\)/,
    );
    // ファイル名 stem (02-tenancy) を例として書かない (id が無いので書ける修飾形が無い)
    assert.doesNotMatch(report.format(), /例: 02-tenancy\/REQ-301/);
    assert.equal(result.unambiguousFixes.find((f) => f.token === 'REQ-301'), undefined, JSON.stringify(result.unambiguousFixes));
  });

  it('修飾 ID: 定義元が 1 件に一意な裸参照は unambiguousFixes に構造化データを積む (non-blocking N-a)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '他ファイルの REQ-001 を裸で参照。\n\n## 3. カバレッジ確認'),
    );
    const { result } = check(root, { requireHumanReview: true });
    const fix = result.unambiguousFixes.find((f) => f.token === 'REQ-001');
    assert.ok(fix, JSON.stringify(result.unambiguousFixes));
    assert.equal(fix?.homeId, 'requirements');
    assert.equal(fix?.file, join('docs', 'design', 'basic', 'function-list.md'));
  });

  it('requireHumanReview 無しでは unambiguousFixes は常に空配列', () => {
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('## 3. カバレッジ確認', '他ファイルの REQ-001 を裸で参照。\n\n## 3. カバレッジ確認'),
    );
    const { result } = check(root);
    assert.deepEqual(result.unambiguousFixes, []);
  });

  it('修飾 ID: 「## 関連」節の対応 ID 列は裸のままでよい (文書列が帰属を示すため)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('修飾 ID: 「## 関連」節でも表の外の自由記述は検査する (code-reviewer B3、表の行だけが除外)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace(
        '| 下流 | [画面設計](./screen-spec.md) | SCR-001 |',
        '| 下流 | [画面設計](./screen-spec.md) | SCR-001 |\n\n表の外の自由記述: REQ-001 を裸で参照。',
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation);
    assert.match(report.format(), /他ファイルの ID は修飾 ID \(<doc-id>\/REQ-001\) で参照する/);
  });

  it('修飾 ID: HTML コメント内の裸参照はコードフェンスと同様に検査対象外にする (code-reviewer 実バグ #10)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace(
        '| FN-001 | 内容 |',
        [
          '| FN-001 | 内容 |',
          '',
          '<!--',
          '  著者向けの注記: この節は REQ-001 の対応状況を書く。まだ書いていない。',
          '-->',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('修飾 ID: 単行の HTML コメント (`<!-- ... -->` が同じ行) も検査対象外にする (code-reviewer 実バグ #10)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace('| FN-001 | 内容 |', '| FN-001 | 内容 |\n\n<!-- 例: REQ-001 は要件定義書由来 -->'),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('修飾 ID: HTML コメントの外にある裸参照は検査対象にする (コメント除外がコメント外まで壊さない)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace(
        '| FN-001 | 内容 |',
        ['| FN-001 | 内容 |', '', '<!-- 著者向けの注記: 特に無し -->', '', '表の外の自由記述: REQ-001 を裸で参照。'].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Violation, report.format());
    assert.match(report.format(), /他ファイルの ID は修飾 ID \(<doc-id>\/REQ-001\) で参照する/);
  });

  it('修飾 ID: 決定台帳の AUTOGEN「仮置き一覧」区間に写された裸参照は検査対象外にする (code-reviewer 実バグ #1)', () => {
    // docs-graph --write は「仮置き」を含む他文書の行をそのまま「本文」列にコピーする。その行が
    // たまたま裸の REQ-001 参照を含んでいても、決定台帳が「REQ-001 を書いた」わけではない。
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(
      root,
      '01-decisions.md',
      decisionLogDoc().replace(
        '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->\n<!-- AUTOGEN:tentative-index:end -->',
        [
          '<!-- AUTOGEN:tentative-index:start — generated by scripts/generate-docs-graph.mjs, do not edit by hand -->',
          '| OPEN | 場所 | 本文 |',
          '|---|---|---|',
          '| **(無し)** | [design/basic/function-list.md:10](design/basic/function-list.md#L10) | 仮置きで REQ-001 を 30 日とする (OPEN 参照なし) |',
          '<!-- AUTOGEN:tentative-index:end -->',
        ].join('\n'),
      ),
    );
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(root, 'design/basic/function-list.md', functionListDoc());
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('決定の帰属・仮置き: AUTOGEN 区間内の記述は帰属・仮置きの検査対象外にする (code-reviewer 実バグ #1)', () => {
    // decision-log/adr/human-review 以外の kind でも、AUTOGEN 区間 (他文書の行の索引) に
    // 「仮置き」等の語が入っていたら主張として検査しない。
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
    writeDoc(
      root,
      'design/basic/function-list.md',
      functionListDoc().replace(
        '| FN-001 | 内容 |',
        [
          '| FN-001 | 内容 |',
          '',
          '<!-- AUTOGEN:x:start -->',
          '索引: 仮置きで30日とする。CEO が決定した (DEC-999)。',
          '<!-- AUTOGEN:x:end -->',
        ].join('\n'),
      ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('未決の関門 (S2): status: fixed の requirements が OPEN-nnn を参照していたら違反、draft なら通る', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    const withOpenRef = (status: string): string =>
      requirementsDoc()
        .replace('kind: requirements', `kind: requirements\nstatus: ${status}`)
        .replace('| REQ-001 | 内容 |', '| REQ-001 | 内容 |\n\n仮置きで decisions/OPEN-001 の30日とする。');

    writeDoc(root, 'product/requirements.md', withOpenRef('fixed'));
    const fixed = check(root, { requireHumanReview: true });
    assert.equal(fixed.report.exitCode, ExitCode.Violation);
    assert.match(fixed.report.format(), /status: fixed だが OPEN-001 を参照している \(未決の関門/);

    writeDoc(root, 'product/requirements.md', withOpenRef('draft'));
    const draft = check(root, { requireHumanReview: true });
    assert.equal(draft.report.exitCode, ExitCode.Ok, draft.report.format());
  });

  it('未決の関門: コードフェンス内の OPEN-nnn は例示であって主張ではない (non-blocking N-d)', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc()
        .replace('kind: requirements', 'kind: requirements\nstatus: fixed')
        .replace('| REQ-001 | 内容 |', ['| REQ-001 | 内容 |', '', '```', '例: OPEN-001 のような書き方をしない', '```'].join('\n')),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });

  it('前提修正: 未決の関門は日付入り ID (OPEN-20260917-02) を未決の OPEN-nnn 参照と誤認しない', () => {
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, '01-decisions.md', decisionLogDoc());
    writeDoc(
      root,
      'product/requirements.md',
      requirementsDoc()
        .replace('kind: requirements', 'kind: requirements\nstatus: fixed')
        .replace(
          '| REQ-001 | 内容 |',
          '| REQ-001 | 内容 |\n\n旧システムの参照番号は OPEN-20260917-02 だった (未決事項ではない)。',
        ),
    );
    const { report } = check(root, { requireHumanReview: true });
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});

describe('DocTemplateCheck: Igeta 自身の docs/ (CI で --require-human-review を通す、code-reviewer 実バグ #5)', () => {
  it('Igeta 自身の docs/ に対して --require-human-review をかけても 0 件', () => {
    const result = new DocTemplateCheck({ requireKind: true, requireHumanReview: true }).analyze({
      targetRoot: IGETA_ROOT,
      igetaRoot: IGETA_ROOT,
    });
    const report = new Report();
    report.addAll(result.violations);
    assert.equal(report.exitCode, ExitCode.Ok, report.format());
  });
});
