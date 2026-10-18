import { describe, expect, it } from 'vitest';
import { requireEnv } from './env.js';

describe('requireEnv', () => {
  it('値があれば返す', () => {
    expect(requireEnv('A', { A: 'v' })).toBe('v');
  });

  it('無ければキー名つきで落ちる', () => {
    expect(() => requireEnv('A', {})).toThrow(/missing required env var: A/);
  });

  it('空文字も無いものとして落ちる', () => {
    expect(() => requireEnv('A', { A: '' })).toThrow(/A/);
  });
});
