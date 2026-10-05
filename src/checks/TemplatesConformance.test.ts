// node --test dist
//
// 根本原因への対処 (2 回目の /code-review、main 指示): 「無編集のテンプレが --require-human-review に
// 落ちる」バグ (実バグ #3 等) は、1 枚ずつ手で気付くたびに直すのでは収束しない。templates/docs/ 配下の
// kind 付きテンプレ**全部**を、無編集のまま (バイト単位でそのまま) 一時 docs/ ツリーへ展開して検査する
// CI 回帰を置く。
//
// テンプレ本体は 1 バイトも書き換えない。ただし各テンプレは depends_on で他 doc の id を参照するため
// (例: `depends_on: [requirements]`)、実際のプロジェクトでは他テンプレを編集して id を揃えるが、単体の
// テンプレの中身が正しいかどうかとは無関係な前提条件なので、depends_on の対象と (kind: requirements の
// 場合の) 地図リンクだけは最小の stub 文書で満たす。stub は「テンプレそのもの」ではなく、テンプレが
// 前提とする周辺文書の代役 (kind: explanation。arc42 も id_prefix も要らない最小の kind)。
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, scalar, stringList } from '../core/Frontmatter.js';
import { IGETA_ROOT } from '../core/Paths.js';
import { ExitCode } from '../core/ExitCode.js';
import { Report } from '../core/Report.js';
import { placementOf } from '../core/Role.js';
import { DocTemplateCheck } from './DocTemplateCheck.js';
import { DocGraphCheck } from './DocGraphCheck.js';

const TEMPLATES_DIR = join(IGETA_ROOT, 'templates', 'docs');
const workspaces: string[] = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

interface TemplateInfo {
  /** templates/docs/ からの相対パス */
  readonly relPath: string;
  /** 検査のために docs/ へ置く相対パス。同じパスに置くが、利用 repo に置かない kind (Igeta の手引き) は、どの kind の置き場所にも当たらない所へ置く */
  readonly docsPath: string;
  readonly kind: string;
  readonly dependsOn: readonly string[];
}

/** 利用 repo には置かない kind (Igeta の手引き 3 本。要件定義書 02 §7) の、検査用の置き場所。ai/ の下で、kind の置き場所の型のどれにも当たらない */
const PINNED_GUIDE_DIR = 'ai/handbook/_pinned';

/** templates/docs/ にある kind 付きテンプレ全部を列挙する (件数を手で書くと追加のたびに落ちる) */
function listTemplates(): TemplateInfo[] {
  const infos: TemplateInfo[] = [];
  for (const file of globSync('**/*.md', { cwd: TEMPLATES_DIR })) {
    const lines = readFileSync(join(TEMPLATES_DIR, file), 'utf8').split(/\r?\n/);
    const fm = parseFrontmatter(lines);
    if (fm === null) continue;
    const kind = scalar(fm.data, 'kind');
    if (kind === undefined || kind === '') continue;
    const placeable = (placementOf(kind)?.patterns.length ?? 0) > 0;
    infos.push({
      relPath: file,
      docsPath: placeable ? file : posix.join(PINNED_GUIDE_DIR, basename(file)),
      kind,
      dependsOn: stringList(fm.data, 'depends_on'),
    });
  }
  return infos;
}

/** depends_on の代役。kind: explanation は arc42 も id_prefix も要らない最小の kind */
function stubDoc(id: string): string {
  return [
    '---',
    `id: ${id}`,
    'title: stub (テスト用の依存先代役)',
    'type: explanation',
    'kind: explanation',
    'status: active',
    'canonical: true',
    'owners: [eng]',
    'created: 2026-01-01',
    'depends_on: []',
    'relates_to: []',
    '---',
    '',
    '# stub',
    '',
    '> **TL;DR**: テスト用スタブ。',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし | — |',
    '| 下流 | なし | — |',
    '',
  ].join('\n');
}

/** 全体の地図の置き場所 (docs/ からの相対)。kind: requirements の雛形の地図リンク要件を満たす代役を、ここに置く */
const MAP_DIR = 'person/design/shared';

/** kind: requirements の地図リンク要件を満たす最小の 00-map.md (テスト対象を「詳細への入口」からリンクする) */
function stubMapDoc(requirementsRelPath: string): string {
  const link = posix.relative(MAP_DIR, requirementsRelPath);
  return [
    '---',
    'id: map',
    'title: 地図',
    'kind: map',
    'status: draft',
    'canonical: true',
    'owners: [product]',
    'created: 2026-01-01',
    'line_limit: 150',
    'depends_on: []',
    'relates_to: []',
    '---',
    '',
    '# 地図',
    '',
    '> **TL;DR**: テスト用スタブ。',
    '',
    // 地図は図が要る kind (人の文書の型)。図の中身は検査しない
    '```mermaid',
    'flowchart LR',
    '  A[地図] --> B[対象]',
    '```',
    '',
    '## 関連',
    '',
    '| 区分 | 文書 | 対応 ID |',
    '|---|---|---|',
    '| 上流 (depends_on) | なし | — |',
    `| 下流 | [対象](${link}) | — |`,
    '',
    ...['1. 何を作るか', '2. 誰が使うか', '3. 主要フロー', '4. やらないこと', '5. 詳細への入口'].flatMap((s) => [
      `## ${s}`,
      '',
      s === '5. 詳細への入口' ? `[対象](${link})` : 'x',
      '',
    ]),
  ].join('\n');
}

/** テンプレを無編集のまま置き、depends_on の代役と (必要なら) 地図の stub を添えた一時ツリーを作る */
function buildIsolatedTree(info: TemplateInfo): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-tpl-conform-'));
  workspaces.push(root);
  const raw = readFileSync(join(TEMPLATES_DIR, info.relPath), 'utf8');
  const target = join(root, 'docs', info.docsPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, raw); // テンプレ本体は 1 バイトも書き換えない

  for (const depId of info.dependsOn) {
    if (depId.startsWith('external:')) continue;
    const stubPath = join(root, 'docs', '_stub', `${depId.replace(/[^a-z0-9-]/gi, '_')}.md`);
    mkdirSync(dirname(stubPath), { recursive: true });
    writeFileSync(stubPath, stubDoc(depId));
  }
  if (info.kind === 'requirements') {
    const mapPath = join(root, 'docs', MAP_DIR, '00-map.md');
    mkdirSync(dirname(mapPath), { recursive: true });
    writeFileSync(mapPath, stubMapDoc(info.docsPath));
  }
  return root;
}

function runTemplateCheck(root: string): { exitCode: ExitCode; detail: string } {
  const result = new DocTemplateCheck({ requireKind: true, requireHumanReview: true }).analyze({
    targetRoot: root,
    igetaRoot: IGETA_ROOT,
  });
  const report = new Report();
  report.addAll(result.violations);
  return { exitCode: report.exitCode, detail: report.format() };
}

describe('テンプレ適合の CI 回帰 (a): 無編集の全テンプレが --require-human-review を通る', () => {
  const templates = listTemplates();
  assert.ok(templates.length > 10, `テンプレの列挙が壊れている (${templates.length} 件しか見つからない)`);

  for (const info of templates) {
    it(`無編集: ${info.relPath} (kind: ${info.kind})`, () => {
      const root = buildIsolatedTree(info);
      const { exitCode, detail } = runTemplateCheck(root);
      assert.equal(exitCode, ExitCode.Ok, `${info.relPath}:\n${detail}`);
    });
  }
});

describe('テンプレ適合の CI 回帰 (b): docs-graph --write → docs-check → template-check --require-human-review が全部 OK', () => {
  it('決定台帳・地図・要件定義を組み合わせた新規ツリーで、生成物 (仮置き一覧等) が自分の検査に落ちない', async () => {
    const root = mkdtempSync(join(tmpdir(), 'igeta-tpl-conform-graph-'));
    workspaces.push(root);
    const copy = (relPath: string): void => {
      const raw = readFileSync(join(TEMPLATES_DIR, relPath), 'utf8');
      const target = join(root, 'docs', relPath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, raw);
    };
    // 無編集の実テンプレをそのまま置く (00-map.md / 01-decisions.md は id が固定なので他と競合しない)。
    copy('person/design/shared/00-map.md');
    copy('person/decisions/01-decisions.md');
    // 決定台帳のフォルダの README.md (ADR 索引の区間を持つ)。新しい repo には init が置く
    copy('person/decisions/README.md');
    // 要件定義書は id: <kebab-slug> のままだと id が定まらないので、実プロジェクトが最初に必ずやる
    // 「id を付ける」だけを行う (本文の構成は実テンプレの必須節に合わせた最小の記入例で、他テンプレへの
    // リンクは持たない自己完結な内容にする — 03-nonfunctional 等の相互リンクは (a) 側で個別に検査済み)。
    mkdirSync(join(root, 'docs', 'person', 'requirements'), { recursive: true });
    writeFileSync(
      join(root, 'docs', 'person', 'requirements', '01-requirements.md'),
      [
        '---',
        'id: requirements',
        'title: 要件定義書',
        'type: product',
        'kind: requirements',
        'arc42: 1',
        'id_prefix: REQ',
        'status: draft',
        'canonical: true',
        'owners: [product, eng]',
        'created: 2026-01-01',
        'depends_on: []',
        'relates_to: []',
        '---',
        '',
        '# 要件定義書',
        '',
        '> **TL;DR**: テスト用の最小記入例。',
        '',
        '## 1. 業務要件',
        '',
        '| ID | 業務要件 | 現状の課題 | 受入基準 | 出典 | 状態 |',
        '|---|---|---|---|---|---|',
        '| REQ-001 | 予約したい | 電話予約しかない | 予約が作成されること | ヒアリング | 決定 |',
        '',
        '猶予は仮置きで30日とする (decisions/OPEN-001)。',
        '',
        '## 2. 機能要件',
        '',
        '| ID | パターン | 要件文 | 対応業務 (REQ-0xx) | 受け入れ条件 | 状態 |',
        '|---|---|---|---|---|---|',
        '| REQ-101 | Event | 予約が確定したとき、システムは通知を送らなければならない | REQ-001 | 通知が送られること | 決定 |',
        '',
        '## 3. 制約',
        '',
        'なし。',
        '',
        '## 4. 前提',
        '',
        'なし。',
        '',
        '## 5. スコープ外',
        '',
        'なし。',
        '',
        '## 決めてほしいこと',
        '',
        '| 問い | 対象 ID | 選択肢 | 決まらないと止まること |',
        '|---|---|---|---|',
        '| 猶予の日数 | REQ-001 | 30 日 / 60 日 | 予約の変更の設計 |',
        '',
        '## 関連',
        '',
        '| 区分 | 文書 | 対応 ID |',
        '|---|---|---|',
        '| 上流 (depends_on) | なし (最上流) | — |',
        '| 下流 | (生成索引が出す) | — |',
        '',
      ].join('\n'),
    );
    // 新規ツリーは write 1 回目で README 索引が増えるため、不動点になるまで 2 回かける
    // (既存の「新規ツリーは write 2 回で不動点になる」と同じ、docs-graph 自体の既知の仕様)。
    for (let i = 0; i < 2; i += 1) {
      const graphCheck = new DocGraphCheck({ write: true });
      const writeViolations = await graphCheck.run({ targetRoot: root, igetaRoot: IGETA_ROOT });
      const writeReport = new Report();
      writeReport.addAll(writeViolations);
      assert.equal(
        writeReport.exitCode,
        ExitCode.Ok,
        `docs-graph --write (${i + 1} 回目):\n${writeReport.format()}\n${graphCheck.warnings.join('\n')}`,
      );
    }

    const checkOnly = new DocGraphCheck({});
    const checkViolations = await checkOnly.run({ targetRoot: root, igetaRoot: IGETA_ROOT });
    const checkReport = new Report();
    checkReport.addAll(checkViolations);
    assert.equal(checkReport.exitCode, ExitCode.Ok, `docs-check:\n${checkReport.format()}\n${checkOnly.warnings.join('\n')}`);

    const { exitCode, detail } = runTemplateCheck(root);
    assert.equal(exitCode, ExitCode.Ok, `template-check --require-human-review:\n${detail}`);
  });
});
