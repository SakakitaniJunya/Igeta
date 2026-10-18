// 見つかりません画面のテスト: 見出しを出す・入口へ戻るボタンで / に移る。

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { NotFound } from '@/app/not-found';
import { findBanner } from '@/shared/test-support/polaris';

describe('NotFound', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('見出しと入口への案内を出す', async () => {
    render(<NotFound />);
    expect(await findBanner('ページが見つかりません')).toBeTruthy();
    expect(screen.getByText('入口から選び直してください。')).toBeTruthy();
  });

  it('入口へ戻るで / に移る', async () => {
    window.history.replaceState(null, '', '/gamma');
    render(<NotFound />);
    await userEvent.click(screen.getByText('入口へ戻る'));
    expect(window.location.pathname).toBe('/');
  });
});
