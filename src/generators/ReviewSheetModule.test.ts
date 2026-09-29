// node --test dist
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractNearMissQualifiedIds, extractQualifiedIds, ReviewSheetModule } from './ReviewSheetModule.js';

const workspaces: string[] = [];

function writeDoc(root: string, rel: string, content: string): void {
  const target = join(root, 'docs', rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'igeta-review-sheet-'));
  workspaces.push(root);
  writeDoc(
    root,
    '01-decisions.md',
    [
      '---',
      'id: decisions',
      'title: 決定台帳',
      'kind: decision-log',
      'depends_on: []',
      '---',
      '',
      '## 1. 決定 (DEC)',
      '',
      '| ID | 日付 | 決めた人 | 原文 | 決定 | 影響する文書 |',
      '|---|---|---|---|---|---|',
      '| DEC-001 | 2026-09-29 | CEO | 青色でいく | 青色申告を継続する | requirements/REQ-101 |',
      '',
    ].join('\n'),
  );
  writeDoc(
    root,
    'product/requirements.md',
    [
      '---',
      'id: requirements',
      'title: 要件定義書',
      'kind: requirements',
      'depends_on: []',
      '---',
      '',
      '| ID | パターン | 要件文 | 対応業務 (REQ-0xx) | 受け入れ条件 |',
      '|---|---|---|---|---|',
      '| REQ-101 | Event | 利用者が空き枠を選んで確定したとき、システムは予約を作成しなければならない | REQ-001 | 予約が作成されること |',
      '',
    ].join('\n'),
  );
  writeDoc(
    root,
    'design/basic/function-list.md',
    ['---', 'id: function-list', 'title: 機能一覧', 'kind: function-list', 'depends_on: [requirements]', '---', '', 'FN-001', ''].join(
      '\n',
    ),
  );
  return root;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('ReviewSheetModule', () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });

  it('正例: 修飾 ID を要件文・受入条件・関連 DEC・下流の設計書に展開する', () => {
    const result = new ReviewSheetModule({ targetRoot: root }).generate(['requirements/REQ-101']);
    assert.equal(result.unresolvedCount, 0, result.markdown);
    const entry = result.entries[0];
    assert.ok(entry?.resolved);
    assert.equal(entry.docRelPath, join('docs', 'product', 'requirements.md'));
    assert.equal(entry.fields?.get('要件文'), '利用者が空き枠を選んで確定したとき、システムは予約を作成しなければならない');
    assert.equal(entry.fields?.get('受け入れ条件'), '予約が作成されること');
    assert.equal(entry.relatedDecisions?.length, 1);
    assert.match(entry.relatedDecisions?.[0] ?? '', /DEC-001/);
    assert.equal(entry.downstream?.length, 1);
    assert.equal(entry.downstream?.[0]?.id, 'function-list');
    assert.match(result.markdown, /## requirements\/REQ-101/);
    assert.match(result.markdown, /\*\*定義ファイル\*\*: `docs[\\/]product[\\/]requirements\.md`/);
  });

  it('負例: doc id が存在しない修飾 ID は解決できない扱いになる', () => {
    const result = new ReviewSheetModule({ targetRoot: root }).generate(['nope/REQ-101']);
    assert.equal(result.unresolvedCount, 1);
    assert.equal(result.entries[0]?.resolved, false);
    assert.match(result.entries[0]?.reason ?? '', /doc id が存在しない: nope/);
  });

  it('負例: doc id は存在するが ID がその文書に無ければ解決できない扱いになる', () => {
    const result = new ReviewSheetModule({ targetRoot: root }).generate(['requirements/REQ-999']);
    assert.equal(result.unresolvedCount, 1);
    assert.match(result.entries[0]?.reason ?? '', /REQ-999 が .*requirements\.md に無い/);
  });

  it('負例: 修飾 ID の形式が不正なら解決できない扱いになる', () => {
    const result = new ReviewSheetModule({ targetRoot: root }).generate(['REQ-101']);
    assert.equal(result.unresolvedCount, 1);
    assert.match(result.entries[0]?.reason ?? '', /修飾 ID の形式が不正/);
  });

  it('関連 DEC が無い場合は「なし」と明記する (サイレント縮退禁止)', () => {
    writeDoc(
      root,
      'product/requirements.md',
      [
        '---', 'id: requirements', 'title: 要件定義書', 'kind: requirements', 'depends_on: []', '---', '',
        '| ID | 要件文 |', '|---|---|', '| REQ-201 | 別の要件 |', '',
      ].join('\n'),
    );
    const result = new ReviewSheetModule({ targetRoot: root }).generate(['requirements/REQ-201']);
    const entry = result.entries[0];
    assert.equal(entry?.relatedDecisions?.length, 0);
    assert.match(result.markdown, /なし \(決定台帳に紐づく行が見つからない\)/);
  });
});

describe('extractQualifiedIds', () => {
  it('PR 本文から修飾 ID (<doc-id>/PREFIX-nnn) を重複無く抜き出す', () => {
    const body = 'この PR は requirements/REQ-101 と decisions/DEC-001 に関わる。requirements/REQ-101 は再掲。';
    assert.deepEqual(extractQualifiedIds(body), ['requirements/REQ-101', 'decisions/DEC-001']);
  });

  it('修飾されていない裸の ID は抜き出さない', () => {
    assert.deepEqual(extractQualifiedIds('REQ-101 だけでは抜き出さない'), []);
  });
});

describe('extractNearMissQualifiedIds (non-blocking N4)', () => {
  it('大文字 doc-id 等の近似表記を警告用に抜き出す', () => {
    assert.deepEqual(extractNearMissQualifiedIds('この PR は Requirements/REQ-101 に関わる。'), ['Requirements/REQ-101']);
  });

  it('正規の修飾 ID は近似表記に含めない (重複警告しない)', () => {
    assert.deepEqual(extractNearMissQualifiedIds('requirements/REQ-101 は正規表記。'), []);
  });
});
