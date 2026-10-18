// ツールバーのテスト: 絞り込み欄に打った文字を onQueryChange に返す・いまの絞り込みを欄に出す・追加を押すと onAdd・disabled の間は押せない。

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { __Feature__Toolbar } from '@/features/__feature__/presentation/components/__Feature__Toolbar';

function renderToolbar(props: Partial<Parameters<typeof __Feature__Toolbar>[0]> = {}) {
  const handlers = { onQueryChange: vi.fn(), onAdd: vi.fn() };
  const view = render(<__Feature__Toolbar query="" {...handlers} {...props} />);
  return { ...handlers, ...view };
}

describe('__Feature__Toolbar', () => {
  it('絞り込み欄に打った文字を onQueryChange に返す', () => {
    const { container, onQueryChange } = renderToolbar();
    const field = container.querySelector('s-text-field[label="絞り込み"]') as HTMLElement & { value: string };
    field.value = '茅';
    fireEvent(field, new Event('input'));
    expect(onQueryChange).toHaveBeenLastCalledWith('茅');
  });

  it('いまの絞り込みの文字を欄に出す', () => {
    const { container } = renderToolbar({ query: '茅野' });
    expect(container.querySelector('s-text-field')?.getAttribute('value')).toBe('茅野');
  });

  it('追加を押すと onAdd を呼ぶ', async () => {
    const { onAdd } = renderToolbar();
    await userEvent.click(screen.getByText('追加'));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('disabled の間は追加ボタンに disabled の印が付く', () => {
    renderToolbar({ disabled: true });
    expect(screen.getByText('追加').hasAttribute('disabled')).toBe(true);
  });
});
