// 件数の表示のテスト: 0・100 件で打ち切りなし (+ なし)・100 件で打ち切り (n+)・省略時は + なし・単位の指定。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountLabel } from '@/shared/presentation/ui/label/CountLabel';

describe('CountLabel', () => {
  it.each([
    ['0 件', { count: 0 }, '0 件'],
    ['100 件でも打ち切られていなければ + を付けない', { count: 100, truncated: false }, '100 件'],
    ['打ち切られたら n+', { count: 100, truncated: true }, '100+ 件'],
    ['truncated を省くと + を付けない', { count: 100 }, '100 件'],
    ['単位を渡す', { count: 3, unit: '人' }, '3 人'],
  ] as const)('%s', (_name, props, expected) => {
    render(<CountLabel {...props} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
