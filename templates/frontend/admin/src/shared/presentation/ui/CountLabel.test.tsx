// 件数の表示のテスト: 0・上限未満・上限ちょうど (n+)・単位の指定・上限を省いたときは「+」を付けない。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountLabel } from '@/shared/presentation/ui/CountLabel';

describe('CountLabel', () => {
  it.each([
    ['0 件', { count: 0, limit: 200 }, '0 件'],
    ['上限未満はそのまま', { count: 199, limit: 200 }, '199 件'],
    ['上限ちょうどは n+', { count: 200, limit: 200 }, '200+ 件'],
    ['上限を省くと + を付けない', { count: 200 }, '200 件'],
    ['単位を渡す', { count: 3, unit: '人' }, '3 人'],
  ] as const)('%s', (_name, props, expected) => {
    render(<CountLabel {...props} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
