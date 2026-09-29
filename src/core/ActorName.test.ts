// node --test dist/core/ActorName.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActor } from './ActorName.js';

describe('normalizeActor', () => {
  it('前後の空白を除く', () => {
    assert.equal(normalizeActor('  agent:writer  '), 'agent:writer');
  });

  it('大文字小文字を統一する', () => {
    assert.equal(normalizeActor('Agent:Writer'), normalizeActor('agent:writer'));
  });

  it('全角英数を NFKC で半角に統一する', () => {
    assert.equal(normalizeActor('ａｇｅｎｔ'), normalizeActor('agent'));
  });
});
