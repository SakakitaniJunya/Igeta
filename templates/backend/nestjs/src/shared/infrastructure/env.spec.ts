import { describe, expect, it } from 'vitest';
import { requireEnv } from '@/shared/infrastructure/env.js';

describe('requireEnv', () => {
  it('ある値を返す', () => {
    expect(requireEnv('A', { A: 'x' })).toBe('x');
  });

  it('無ければ名前つきで投げる', () => {
    expect(() => requireEnv('A', {})).toThrow(/A/);
  });

  it('空文字も無いものとして投げる', () => {
    expect(() => requireEnv('A', { A: '' })).toThrow(/A/);
  });
});
