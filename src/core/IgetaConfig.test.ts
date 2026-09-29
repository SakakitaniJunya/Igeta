// node --test dist/core/IgetaConfig.test.js
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.deepEqual(result, { config: { sharedKinds: ['glossary'], contextSizeLimit: 500 } });
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
    assert.deepEqual(result, { config: { sharedKinds: DEFAULT_IGETA_CONFIG.sharedKinds, contextSizeLimit: 10 } });
  });
});
