// 確認ダイアログのテスト: 確定は true・やめるは false・外側を閉じた (hide) は false。結果は 1 回だけ返す。request が null なら何も出さない。

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/presentation/ui/control/ConfirmDialog';

const REQUEST: ConfirmRequest = { heading: '項目を終了しますか', message: '終了すると操作できなくなります。', confirmLabel: '終了する', tone: 'critical' };

describe('ConfirmDialog', () => {
  it('確定を押すと true を 1 回だけ返す', async () => {
    const onResult = vi.fn();
    render(<ConfirmDialog request={REQUEST} onResult={onResult} />);
    await userEvent.click(screen.getByText('終了する'));
    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it('やめるを押すと false を返す', async () => {
    const onResult = vi.fn();
    render(<ConfirmDialog request={REQUEST} onResult={onResult} />);
    await userEvent.click(screen.getByText('やめる'));
    expect(onResult).toHaveBeenCalledWith(false);
  });

  it('外側を閉じた (hide) は false を返し、続けて確定を押しても 2 回目は返さない', async () => {
    const onResult = vi.fn();
    const { container } = render(<ConfirmDialog request={REQUEST} onResult={onResult} />);
    fireEvent(container.querySelector('s-modal') as HTMLElement, new Event('hide'));
    await userEvent.click(screen.getByText('終了する'));
    expect(onResult.mock.calls).toEqual([[false]]);
  });

  it('request が null なら何も出さない', () => {
    const { container } = render(<ConfirmDialog request={null} onResult={() => undefined} />);
    expect(container.querySelector('s-modal')).toBeNull();
  });
});
