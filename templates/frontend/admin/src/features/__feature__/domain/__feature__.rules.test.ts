// 規則のテスト(表形式): 未知の状態は closed 扱い・閉じられるのは開いているものだけ。

import { describe, expect, it } from 'vitest';
import { canClose, normalizeStatus } from '@/features/__feature__/domain/__feature__.rules';

describe('normalizeStatus', () => {
  it.each([
    ['open', 'open'],
    ['closed', 'closed'],
    ['未来に増えた状態', 'closed'],
    ['', 'closed'],
    ['OPEN', 'closed'],
    ['toString', 'closed'],
  ])('%j は %s', (raw, expected) => {
    expect(normalizeStatus(raw)).toBe(expected);
  });
});

describe('canClose', () => {
  it.each([
    ['open', true],
    ['closed', false],
  ] as const)('%s は閉じられる: %s', (status, expected) => {
    expect(canClose(status)).toBe(expected);
  });
});
