// URL の道具のテスト: search の引き継ぎ・同じ名前の上書き・null で外す・空なら path だけ。

import { describe, expect, it } from 'vitest';
import { withSearch } from '@/shared/domain/url';

describe('withSearch', () => {
  it('search を引き継いで path に付ける', () => {
    expect(withSearch('/samples', '?host=abc')).toBe('/samples?host=abc');
  });

  it('同じ名前は上書きし、別の名前は残す', () => {
    expect(withSearch('/samples', '?host=abc&page=1', { page: '2' })).toBe('/samples?host=abc&page=2');
  });

  it('null の名前は外す', () => {
    expect(withSearch('/samples', '?host=abc&page=1', { page: null })).toBe('/samples?host=abc');
  });

  it('引き継ぐものが無ければ path だけ', () => {
    expect(withSearch('/samples', '')).toBe('/samples');
  });
});
