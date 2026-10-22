// 状態の印のテスト: 渡された語を出す・tone を渡すと印に付く・tone を省くと付かない。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/shared/presentation/ui/label/StatusBadge';

describe('StatusBadge', () => {
  it('語を出し、tone を渡すと印に付く', () => {
    const { container } = render(<StatusBadge label="使用中" tone="success" />);
    expect(screen.getByText('使用中')).toBeTruthy();
    expect(container.querySelector('s-badge')?.getAttribute('tone')).toBe('success');
  });

  it('tone を省くと印に tone が付かない', () => {
    const { container } = render(<StatusBadge label="停止" />);
    expect(screen.getByText('停止')).toBeTruthy();
    expect(container.querySelector('s-badge')?.getAttribute('tone')).toBeNull();
  });
});
