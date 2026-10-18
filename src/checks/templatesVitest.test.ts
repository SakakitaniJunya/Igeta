import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVitestJson } from './templatesVitest.js';

const json = {
  testResults: [
    { name: '/w/src/a.spec.ts', status: 'passed', assertionResults: [{ status: 'passed', title: 'a' }, { status: 'failed', title: 'b' }] },
    { name: '/w/src/x.emulator.spec.ts', status: 'passed', assertionResults: [{ status: 'skipped', title: 'e', fullName: 'X e' }] },
    { name: '/w/src/y.spec.ts', status: 'passed', assertionResults: [{ status: 'pending', title: 'p' }] },
    { name: '/w/src/broken.spec.ts', status: 'failed', assertionResults: [] },
  ],
};

describe('summarizeVitestJson', () => {
  it('合格・失敗・読み込みで落ちたファイルを数える', () => {
    const s = summarizeVitestJson(json, false);
    assert.equal(s.files, 4);
    assert.equal(s.passed, 1);
    assert.equal(s.failed, 2);
  });

  it('emulator の spec の skip だけを、--require-emulator なしで許す', () => {
    const loose = summarizeVitestJson(json, false);
    assert.deepEqual(loose.skipped.map((k) => [k.file.split('/').pop(), k.allowed]), [['x.emulator.spec.ts', true], ['y.spec.ts', false]]);
    const strict = summarizeVitestJson(json, true);
    assert.ok(strict.skipped.every((k) => !k.allowed));
    assert.match(strict.skipped[0]?.reason ?? '', /許さない/);
  });

  it('壊れた入力は 0 件', () => {
    assert.deepEqual(summarizeVitestJson(null, false), { files: 0, passed: 0, failed: 0, skipped: [] });
    assert.deepEqual(summarizeVitestJson({ testResults: 3 }, false).files, 0);
  });
});
