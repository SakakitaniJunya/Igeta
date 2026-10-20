import { describe, expect, it } from 'vitest';
import { AppError } from './app-error';
import { takePage } from './list-page';

describe('list-page', () => {
  it('TST-107 3 件の行を limit 2 で渡すとき items は 2 件で isTruncated は true', () => {
    const page = takePage(['a', 'b', 'c'], 2);

    expect(page.items).toEqual(['a', 'b']);
    expect(page.isTruncated).toBe(true);
  });

  it('TST-108 3 件の行を limit 3 で渡すとき items は 3 件で isTruncated は false', () => {
    const page = takePage(['a', 'b', 'c'], 3);

    expect(page.items).toEqual(['a', 'b', 'c']);
    expect(page.isTruncated).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])('TST-109 limit が %s のとき invalid を投げる', (limit) => {
    const takeWithLimit = () => takePage(['a'], limit);

    expect(takeWithLimit).toThrow(AppError);
  });
});
