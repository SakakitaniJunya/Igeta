// node --test dist/core/IgetaConfig.test.js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_IGETA_CONFIG, loadIgetaConfig } from './IgetaConfig.js';

const workspaces: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'yatsu-igetaconfig-'));
  workspaces.push(root);
  return root;
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

describe('loadIgetaConfig', () => {
  it('ファイルが無ければ既定値', () => {
    const result = loadIgetaConfig(makeRoot());
    assert.deepEqual(result, { config: DEFAULT_IGETA_CONFIG });
  });

  it('sharedKinds と contextSizeLimit を読む', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ sharedKinds: ['glossary'], contextSizeLimit: 500 }));
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, { config: { sharedKinds: ['glossary'], contextSizeLimit: 500, coverageExemptions: [] } });
  });

  it('未知のフィールドは無視する (将来の設定追加に備える)', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ reagreementRules: ['x'] }));
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, { config: DEFAULT_IGETA_CONFIG });
  });

  it('CannotCheck: JSON が壊れている', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), '{ not json');
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
    assert.equal((result as { violation: { severity: string } }).violation.severity, 'cannot-check');
  });

  it('CannotCheck: オブジェクトでない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), '[1,2,3]');
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('CannotCheck: sharedKinds が文字列の配列でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ sharedKinds: [1, 2] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('CannotCheck: contextSizeLimit が正の数でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ contextSizeLimit: -1 }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result);
  });

  it('--config で場所を上書きできる', () => {
    const root = makeRoot();
    const altPath = join(root, 'alt.json');
    writeFileSync(altPath, JSON.stringify({ contextSizeLimit: 10 }));
    const result = loadIgetaConfig(root, altPath);
    assert.deepEqual(result, {
      config: { sharedKinds: DEFAULT_IGETA_CONFIG.sharedKinds, contextSizeLimit: 10, coverageExemptions: [] },
    });
  });

  it('coverageExemptions ({ id, reason } の配列) を読む', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, '.igeta.json'),
      JSON.stringify({ coverageExemptions: [{ id: 'reservation-flow/REQ-999', reason: '内部専用 API、顧客要件外' }] }),
    );
    const result = loadIgetaConfig(root);
    assert.deepEqual(result, {
      config: {
        sharedKinds: DEFAULT_IGETA_CONFIG.sharedKinds,
        contextSizeLimit: null,
        coverageExemptions: [{ id: 'reservation-flow/REQ-999', reason: '内部専用 API、顧客要件外' }],
      },
    });
  });

  it('CannotCheck: coverageExemptions の要素に reason が無い (理由必須)', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ coverageExemptions: [{ id: 'x/REQ-001' }] }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: coverageExemptions が配列でない', () => {
    const root = makeRoot();
    writeFileSync(join(root, '.igeta.json'), JSON.stringify({ coverageExemptions: 'x' }));
    const result = loadIgetaConfig(root);
    assert.ok('violation' in result, JSON.stringify(result));
  });

  it('CannotCheck: --config で明示した場所が無い (省略時の既定値フォールバックと違う。code-reviewer round 1 blocker 1)', () => {
    const root = makeRoot();
    const result = loadIgetaConfig(root, join(root, 'nonexistent.json'));
    assert.ok('violation' in result, JSON.stringify(result));
    assert.match((result as { violation: { message: string } }).violation.message, /--config で指定した場所が無い/);
  });

  it('省略時 (既定パス) に .igeta.json が無いのは既定値のまま (回帰確認)', () => {
    const root = makeRoot();
    assert.deepEqual(loadIgetaConfig(root), { config: DEFAULT_IGETA_CONFIG });
  });

  it('CannotCheck: 指定した場所がディレクトリ (「JSON が壊れている」と誤表示しない)', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'a-directory'));
    const result = loadIgetaConfig(root, join(root, 'a-directory'));
    assert.ok('violation' in result, JSON.stringify(result));
    assert.match((result as { violation: { message: string } }).violation.message, /ディレクトリ/);
    assert.doesNotMatch((result as { violation: { message: string } }).violation.message, /JSON が壊れている/);
  });
});
