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
    ...['1. 業務要件', '2. 機能要件', '3. 制約', '4. 前提', '5. スコープ外'].flatMap((s) => [`## ${s}`, '', 'REQ-001 の内容', '']),
  ].join('\n');
}

function functionListDoc(bodyExtra = ''): string {
  return [
    '---', 'id: function-list', 'title: 機能一覧', 'kind: function-list', 'arc42: 1', 'depends_on: [requirements]', 'relates_to: []', '---', '',
    '# 機能一覧', '', '> **TL;DR**: 最小の機能一覧。', '',
    '## 関連', '', '| 区分 | 文書 | 対応 ID |', '|---|---|---|',
    '| 上流 (depends_on) | [要件定義書](../../product/requirements.md) | REQ-001 |', '| 下流 | [画面設計](./screen-spec.md) | SCR-001 |', '',
    '## 1. 機能一覧', '', `FN-001 の内容${bodyExtra}`, '',
    '## 2. 機能別の状態・権限', '', 'FN-001 の内容', '',
    '## 3. カバレッジ確認', '', 'FN-001 の内容', '',
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

  it('負例: 複数ファイルのローカル採番で曖昧な ID は対象外にする (推測で書き換えない)', () => {
    writeDoc(root, 'product/requirements-b.md', requirementsDoc().replace('id: requirements', 'id: requirements-b'));
    writeDoc(root, '00-map.md', mapDoc().replace('./product/requirements.md', './product/requirements.md) / [要件B](./product/requirements-b.md'));
    writeDoc(root, 'design/basic/function-list.md', functionListDoc('。他ファイルの REQ-001 を裸で参照。'));
    const plan = new FixIdsModule({ targetRoot: root, igetaRoot: root }).plan();
    assert.equal(plan.find((p) => p.file.endsWith('function-list.md')), undefined, JSON.stringify(plan));
  });
});
