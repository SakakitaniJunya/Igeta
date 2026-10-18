// 保存の道具のテスト: 書いた値を読める・空や無い値は null・保存が使えなくても投げない。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSessionValue, writeSessionValue } from '@/shared/infrastructure/session';

describe('session', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('書いた値を読める', () => {
    writeSessionValue('sample:last-id', 'a-1');
    expect(readSessionValue('sample:last-id')).toBe('a-1');
  });

  it('無い値・空の値は null', () => {
    expect(readSessionValue('sample:none')).toBeNull();
    window.localStorage.setItem('sample:empty', '');
    expect(readSessionValue('sample:empty')).toBeNull();
  });

  it('保存が使えなくても投げず、読みは null', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeSessionValue('sample:last-id', 'a-1')).not.toThrow();
    expect(readSessionValue('sample:last-id')).toBeNull();
  });
});
