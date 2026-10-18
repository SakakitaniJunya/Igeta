import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isKebab, toCamel, toPascal, toSnake } from './Naming.js';

describe('Naming', () => {
  it('ケバブだけを受ける', () => {
    for (const ok of ['a', 'stock-item', 'a1', 'a-b2-c']) assert.equal(isKebab(ok), true, ok);
    for (const ng of ['', 'Stock', 'stock_item', '-a', 'a-', 'a--b', '1a', 'a b', 'a.b']) {
      assert.equal(isKebab(ng), false, ng);
    }
  });

  it('パスカル・キャメル・スネークへ変換する', () => {
    assert.equal(toPascal('stock-item'), 'StockItem');
    assert.equal(toCamel('stock-item'), 'stockItem');
    assert.equal(toSnake('stock-item'), 'stock_item');
    assert.equal(toPascal('location'), 'Location');
    assert.equal(toCamel('location'), 'location');
  });
});
