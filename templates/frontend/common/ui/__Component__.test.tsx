import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { __Component__ } from './__Component__';

describe('__Component__', () => {
  it('見出しと本文を文字として出す', () => {
    render(<__Component__ heading="見出し" message="<b>本文</b>" />);
    expect(screen.getByText('見出し')).toBeTruthy();
    // HTML として差し込まない (タグがそのまま文字で出る)
    expect(screen.getByText('<b>本文</b>')).toBeTruthy();
  });

  it('ボタンを押すと onAction を呼ぶ', async () => {
    const onAction = vi.fn();
    render(<__Component__ heading="h" message="m" actionLabel="やり直す" onAction={onAction} />);
    await userEvent.click(screen.getByText('やり直す'));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('onAction が無ければボタンを出さない', () => {
    render(<__Component__ heading="h" message="m" actionLabel="やり直す" />);
    expect(screen.queryByText('やり直す')).toBeNull();
  });
});
