// App Bridge の道具のテスト: gid の末尾の数字を取り出す。数字が無い・文字でない値は null。

import { describe, expect, it } from 'vitest';
import { numericId } from '@/shared/infrastructure/app-bridge';

describe('numericId', () => {
  it.each([
    ['gid の末尾の数字', 'gid://shopify/Product/123', '123'],
    ['数字だけ', '456', '456'],
    ['数字が無い', 'gid://shopify/Product/', null],
    ['文字でない値', 789, null],
    ['無い値', undefined, null],
  ])('%s', (_name, value, expected) => {
    expect(numericId(value)).toBe(expected);
  });
});
