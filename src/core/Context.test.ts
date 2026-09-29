// node --test dist/core/Context.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FrontmatterData } from './Frontmatter.js';
import { readContext, SHARED_CONTEXT } from './Context.js';

const data = (entries: Record<string, string>): FrontmatterData => new Map(Object.entries(entries));

describe('readContext', () => {
  it('無記入は shared', () => {
    assert.equal(readContext('requirements', data({})), SHARED_CONTEXT);
  });

  it('空文字も shared', () => {
    assert.equal(readContext('requirements', data({ context: '' })), SHARED_CONTEXT);
  });

  it('記入した kebab の値をそのまま返す', () => {
    assert.equal(readContext('requirements', data({ context: 'reservation' })), 'reservation');
  });

  it('delivery-chapter は context を書いていても shared として扱う (適用しない)', () => {
    assert.equal(readContext('delivery-chapter', data({ context: 'reservation' })), SHARED_CONTEXT);
  });

  it('kind が null (未管理 doc) でも shared を返す', () => {
    assert.equal(readContext(null, data({})), SHARED_CONTEXT);
  });
});
