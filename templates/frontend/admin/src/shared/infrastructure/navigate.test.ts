// 移動の道具のテスト: 引数 (search) を引き継ぐ・置き換えは履歴を増やさない・購読は移動で呼ばれ、外すと呼ばれない。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPath, navigate, subscribe } from '@/shared/infrastructure/navigate';

describe('navigate', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('移動しても search を引き継ぐ', () => {
    window.history.replaceState(null, '', '/a?host=h1');
    navigate('/b');
    expect(window.location.pathname).toBe('/b');
    expect(window.location.search).toBe('?host=h1');
  });

  it('replace は履歴を増やさない', () => {
    window.history.replaceState(null, '', '/a');
    const before = window.history.length;
    navigate('/c', { replace: true });
    expect(window.history.length).toBe(before);
    expect(currentPath()).toBe('/c');
  });

  it('購読は移動で呼ばれ、外すと呼ばれない', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    navigate('/d');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    navigate('/e');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
