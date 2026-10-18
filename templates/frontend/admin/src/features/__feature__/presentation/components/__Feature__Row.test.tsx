// 一覧の 1 行のテスト: 名称を文字として出す (HTML として差し込まない)・状態の語・開いているものは終了を押せる・閉じ済みは押せない (disabled)。

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { __Feature__Row } from '@/features/__feature__/presentation/components/__Feature__Row';
import { modelFixture } from '@/features/__feature__/test-support/__feature__.fixtures';

const OPEN = modelFixture({ name: '<b>見本</b>' });
const CLOSED = modelFixture({ id: 'b-2', name: '見本B', status: 'closed' });

describe('__Feature__Row', () => {
  it('名称を文字として出す (HTML として差し込まない)', () => {
    render(<__Feature__Row item={OPEN} onClose={() => undefined} />);
    expect(screen.getByText('<b>見本</b>')).toBeTruthy();
  });

  it('状態の語を出す', () => {
    render(<__Feature__Row item={OPEN} onClose={() => undefined} />);
    expect(screen.getByText('開いている')).toBeTruthy();
  });

  it('開いているものは終了を押せ、押すとその行を onClose に渡す', async () => {
    const onClose = vi.fn();
    render(<__Feature__Row item={OPEN} onClose={onClose} />);
    await userEvent.click(screen.getByText('終了', { selector: 's-button' }));
    expect(onClose).toHaveBeenCalledWith(OPEN);
  });

  it('閉じ済みは終了に disabled の印が付く', () => {
    render(<__Feature__Row item={CLOSED} onClose={() => undefined} />);
    expect(screen.getByText('終了', { selector: 's-button' }).hasAttribute('disabled')).toBe(true);
  });

  it('送信中は開いているものでも disabled', () => {
    render(<__Feature__Row item={OPEN} disabled onClose={() => undefined} />);
    expect(screen.getByText('終了', { selector: 's-button' }).hasAttribute('disabled')).toBe(true);
  });
});
