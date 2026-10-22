// 移動の hook のテスト: 移動の先の path を渡すと履歴が変わり、search は引き継がれる。

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useNavigate } from '@/shared/application/hooks/navigate';

describe('useNavigate', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('呼ぶと移動し、search を引き継ぐ', () => {
    window.history.replaceState(null, '', '/?host=h1');
    const { result } = renderHook(() => useNavigate());
    result.current('/samples');
    expect(window.location.pathname).toBe('/samples');
    expect(window.location.search).toBe('?host=h1');
  });

  it('replace を指定すると履歴を増やさない', () => {
    window.history.replaceState(null, '', '/a');
    const before = window.history.length;
    const { result } = renderHook(() => useNavigate());
    result.current('/b', { replace: true });
    expect(window.history.length).toBe(before);
  });
});
