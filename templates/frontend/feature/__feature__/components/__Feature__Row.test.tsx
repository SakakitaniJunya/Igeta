import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { __Feature__Row } from './__Feature__Row';

const ITEM = { id: 'a-1', name: '<b>サンプル</b>', active: true };

describe('__Feature__Row', () => {
  it('名前を文字として出す (HTML として差し込まない)', () => {
    render(<__Feature__Row item={ITEM} onToggle={() => undefined} />);
    expect(screen.getByText('<b>サンプル</b>')).toBeTruthy();
  });

  it('使用中なら「停止」、停止中なら「再開」', () => {
    const { rerender } = render(<__Feature__Row item={ITEM} onToggle={() => undefined} />);
    expect(screen.getByText('停止', { selector: 's-button' })).toBeTruthy();
    rerender(<__Feature__Row item={{ ...ITEM, active: false }} onToggle={() => undefined} />);
    expect(screen.getByText('再開', { selector: 's-button' })).toBeTruthy();
  });

  it('ボタンを押すと、その行を onToggle に渡す', async () => {
    const onToggle = vi.fn();
    render(<__Feature__Row item={ITEM} onToggle={onToggle} />);
    await userEvent.click(screen.getByText('停止', { selector: 's-button' }));
    expect(onToggle).toHaveBeenCalledWith(ITEM);
  });
});
