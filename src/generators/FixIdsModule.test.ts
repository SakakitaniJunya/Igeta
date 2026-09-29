// node --test dist
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IGETA_ROOT } from '../core/Paths.js';
import { FixIdsModule } from './FixIdsModule.js';

const workspaces: string[] = [];

function writeDoc(root: string, rel: string, content: string): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-fix-ids-'));
  workspaces.push(root);
  cpSync(join(IGETA_ROOT, 'templates', 'docs'), join(root, 'templates', 'docs'), { recursive: true });
  return root;
}

function mapDoc(): string {
  return [
    '---', 'id: map', 'kind: map', 'status: draft', 'line_limit: 150', 'depends_on: []', 'relates_to: []', '---', '',
    '# 地図', '', '> **TL;DR**: テスト。', '',
    '## 関連', '', '| 区分 | 文書 | 対応 ID |', '|---|---|---|',
    '| 上流 (depends_on) | なし | — |', '| 下流 | [要件定義書](./product/requirements.md) | — |', '',
    ...['1. 何を作るか', '2. 誰が使うか', '3. 主要フロー', '4. やらないこと', '5. 詳細への入口'].flatMap((s) => [`## ${s}`, '', 'x', '']),
  ].join('\n');
}

function requirementsDoc(): string {
  return [
    '---', 'id: requirements', 'kind: requirements', 'arc42: 1', 'depends_on: []', '---', '',
    '> **TL;DR**: 要件。', '',
    '## 関連', '', '| 区分 | 文書 | 対応 ID |', '|---|---|---|',
    '| 上流 (depends_on) | なし (最上流) | — |', '| 下流 | [機能一覧](./function-list.md) | FN-001 |', '',
    // ID の「定義」は行頭セル (`| REQ-001 | ... |`) だけを数える (code-reviewer 実バグ #3/#7)
    ...['1. 業務要件', '2. 機能要件', '3. 制約', '4. 前提', '5. スコープ外'].flatMap((s) => [`## ${s}`, '', '| REQ-001 | 内容 |', '']),
  ].join('\n');
}

function functionListDoc(bodyExtra = ''): string {
  return [
    '---', 'id: function-list', 'title: 機能一覧', 'kind: function-list', 'arc42: 1', 'depends_on: [requirements]', 'relates_to: []', '---', '',
    '# 機能一覧', '', '> **TL;DR**: 最小の機能一覧。', '',
    '## 関連', '', '| 区分 | 文書 | 対応 ID |', '|---|---|---|',
    '| 上流 (depends_on) | [要件定義書](../../product/requirements.md) | REQ-001 |', '| 下流 | [画面設計](./screen-spec.md) | SCR-001 |', '',
    '## 1. 機能一覧', '', '| FN-001 | 内容 |', ...(bodyExtra === '' ? [] : ['', bodyExtra]), '',
    '## 2. 機能別の状態・権限', '', '| FN-001 | 内容 |', '',
    '## 3. カバレッジ確認', '', '| FN-001 | 内容 |', '',
  ].join('\n');
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('FixIdsModule', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
    writeDoc(root, '00-map.md', mapDoc());
    writeDoc(root, 'product/requirements.md', requirementsDoc());
  });

  it('正例: 定義元が 1 件に一意な裸の ID 参照を修飾 ID に書き換える計画を作る', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const plan = new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    const hit = plan.find((p) => p.file.endsWith('function-list.md'));
    assert.ok(hit, JSON.stringify(plan));
    assert.match(hit?.after ?? '', /requirements\/REQ-001/);
    assert.doesNotMatch(hit?.before ?? '', /requirements\/REQ-001/);
  });

  it('plan() はファイルを書き換えない (dry-run)', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const fnPath = join(root, 'docs', 'design', 'basic', 'function-list.md');
    const before = readFileSync(fnPath, 'utf8');
    new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    assert.equal(readFileSync(fnPath, 'utf8'), before);
  });

  it('write() で実際に書き込む', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const module = new FixIdsModule({ targetRoot: root, igetaRoot: root });
    const plan = module.plan();
    module.write(plan);
    const fnPath = join(root, 'docs', 'design', 'basic', 'function-list.md');
    assert.match(readFileSync(fnPath, 'utf8'), /requirements\/REQ-001/);
    assert.equal(module.plan().length, 0, '書き換え後は同じ違反が出ない');
  });

  it('write() は元の改行コード (CRLF) を保つ (code-reviewer 実バグ #8)', () => {
    const fnPath = join(root, 'docs', 'design', 'basic', 'function-list.md');
    mkdirSync(dirname(fnPath), { recursive: true });
    // CRLF で直接書き込む (functionListDoc() は \n 連結なので、ここだけ明示的に CRLF 化する)
    writeFileSync(fnPath, functionListDoc('。他ファイルの REQ-001 を裸で参照。').replace(/\n/g, '\r\n'));
    const module = new FixIdsModule({ targetRoot: root, igetaRoot: root });
    const plan = module.plan();
    assert.ok(plan.length > 0, 'this test needs at least one planned fix');
    module.write(plan);
    const after = readFileSync(fnPath, 'utf8');
    assert.match(after, /requirements\/REQ-001/);
    // 全ての改行が \r\n のペアであること (LF 単独の改行が 1 つも残っていないこと)
    const bareLfCount = (after.replace(/\r\n/g, '').match(/\n/g) ?? []).length;
    assert.equal(bareLfCount, 0, `LF 単独の改行が残っている (CRLF が保たれていない): ${JSON.stringify(after)}`);
  });

  it('負例: 複数ファイルのローカル採番で曖昧な ID は対象外にする (推測で書き換えない)', () => {
    writeDoc(root, 'product/requirements-b.md', requirementsDoc().replace('id: requirements', 'id: requirements-b'));
    writeDoc(root, '00-map.md', mapDoc().replace('./product/requirements.md', './product/requirements.md) / [要件B](./product/requirements-b.md'));
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const plan = new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    assert.equal(plan.find((p) => p.file.endsWith('function-list.md')), undefined, JSON.stringify(plan));
  });

  it('負例: 同一行に「空白区切りで修飾済み」と「裸」が両方あるとき、修飾済みの方は壊さない (code-reviewer round 3 C4、main 再現 fixture)', () => {
    // main の再現そのもの: frontmatter id (tenancy) とファイル名 stem (02-tenancy) が食い違う。
    // requirements.md は REQ-001 を定義するので REQ-114 とは競合しない。
    writeDoc(root, 'product/02-tenancy.md', requirementsDoc().replace('id: requirements', 'id: tenancy').replace(/REQ-001/g, 'REQ-114'));
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace(
        '| 下流 | [要件定義書](./product/requirements.md) | — |',
        '| 下流 | [要件定義書](./product/requirements.md) / [tenancy](./product/02-tenancy.md) | — |',
      ),
    );
    writeDoc(
      root,
      'design/basic/01-function-list.md',
      functionListDoc('。FN-001 tenancy REQ-114 と REQ-114 の両方を参照'),
    );
    const plan = new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    const hit = plan.find((p) => p.file.endsWith('01-function-list.md'));
    assert.ok(hit, JSON.stringify(plan));
    // 期待どおり id (tenancy) で修飾する。stem (02-tenancy) では書かない
    assert.match(hit?.after ?? '', /FN-001 tenancy REQ-114 と tenancy\/REQ-114 の両方を参照/);
    // 空白区切りで既に修飾済みだった先頭の出現 ("tenancy REQ-114") が壊れていないこと
    // (id/stem の食い違いで「未修飾」と誤認し、二重修飾する再現ケース)
    assert.doesNotMatch(hit?.after ?? '', /tenancy (tenancy|02-tenancy)\/REQ-114/);
    assert.doesNotMatch(hit?.after ?? '', /02-tenancy\/REQ-114/); // stem 形式では書かない
  });

  it('負例: id とファイル名 stem が食い違う場合の一般形 (`crosscutting REQ-nnn` 型、code-reviewer round 3 C4)', () => {
    // frontmatter id: crosscutting、ファイル名 stem: 04-crosscutting という manabi-zone の実例と同じ食い違い
    writeDoc(
      root,
      'product/04-crosscutting.md',
      requirementsDoc().replace('id: requirements', 'id: crosscutting').replace(/REQ-001/g, 'REQ-201'),
    );
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace(
        '| 下流 | [要件定義書](./product/requirements.md) | — |',
        '| 下流 | [要件定義書](./product/requirements.md) / [crosscutting](./product/04-crosscutting.md) | — |',
      ),
    );
    writeDoc(
      root,
      'design/basic/01-function-list.md',
      functionListDoc('。FN-001 crosscutting REQ-201 と REQ-201 の両方を参照'),
    );
    const plan = new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    const hit = plan.find((p) => p.file.endsWith('01-function-list.md'));
    assert.ok(hit, JSON.stringify(plan));
    assert.match(hit?.after ?? '', /FN-001 crosscutting REQ-201 と crosscutting\/REQ-201 の両方を参照/);
    assert.doesNotMatch(hit?.after ?? '', /crosscutting (crosscutting|04-crosscutting)\/REQ-201/);
    assert.doesNotMatch(hit?.after ?? '', /04-crosscutting\/REQ-201/);
  });

  it('負例: requirements 同士の裸参照 (言及であって定義ではない) は違反になり、fix-ids が直せる (code-reviewer 実バグ #3)', () => {
    // doc A (id: requirements-a) が REQ-201 を要件表の行頭セルで「定義」する。複数行・複数節を持つ
    // 実テンプレに近い構成 (業務要件/機能要件/制約/前提/スコープ外の 5 節、各節に表の行が 1 つ)。
    const docA = requirementsDoc()
      .replace('id: requirements', 'id: requirements-a')
      .replace(/\| REQ-001 \| 内容 \|/g, '| REQ-201 | 内容 |');
    // doc B (id: requirements-b) は自分の REQ-001 を定義する一方、「前提」節で REQ-201 に**言及**
    // するだけ (行頭セルではない自由記述)。これは定義ではないので、doc B に home が増えてはいけない。
    const docB = requirementsDoc()
      .replace('id: requirements', 'id: requirements-b')
      .replace(
        '## 4. 前提\n\n| REQ-001 | 内容 |',
        '## 4. 前提\n\n| REQ-001 | 内容 |\n\n他文書 (requirements-a) の REQ-201 が成立していることを前提とする (裸参照)。',
      );
    writeDoc(
      root,
      '00-map.md',
      mapDoc().replace(
        '| 下流 | [要件定義書](./product/requirements.md) | — |',
        '| 下流 | [要件A](./product/01-requirements.md) / [要件B](./product/02-other-requirements.md) | — |',
      ),
    );
    writeDoc(root, 'product/01-requirements.md', docA);
    writeDoc(root, 'product/02-other-requirements.md', docB);

    const module = new FixIdsModule({ targetRoot: root, igetaRoot: root });
    const plan = module.plan();
    const hit = plan.find((p) => p.file.endsWith('02-other-requirements.md'));
    assert.ok(hit, JSON.stringify(plan));
    assert.match(hit?.after ?? '', /requirements-a\/REQ-201 が成立していることを前提とする/);
    assert.doesNotMatch(hit?.before ?? '', /requirements-a\/REQ-201/);

    module.write(plan);
    assert.equal(module.plan().length, 0, '書き換え後は同じ違反が出ない (doc B に定義が増えたわけではない)');
  });

  it('write() は plan() 後にファイルが変わっていたら drifted に積んで書かない (non-blocking N-b)', () => {
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const module = new FixIdsModule({ targetRoot: root, igetaRoot: root });
    const plan = module.plan();
    assert.ok(plan.length > 0, 'this test needs at least one planned fix');

    // plan() 後にファイルの当該行を書き換える (競合を再現する)
    const fnPath = join(root, 'docs', 'design', 'basic', 'function-list.md');
    const lines = readFileSync(fnPath, 'utf8').split(/\r?\n/);
    const target = plan[0];
    assert.ok(target);
    lines[target.line - 1] = '差分が入ったので before と一致しない';
    writeFileSync(fnPath, lines.join('\n'));

    const result = module.write(plan);
    assert.equal(result.written.length, 0, JSON.stringify(result));
    assert.equal(result.drifted.length, 1, JSON.stringify(result));
    assert.equal(readFileSync(fnPath, 'utf8'), lines.join('\n'), '書かなかったのでファイルは変わらない');
  });
});
