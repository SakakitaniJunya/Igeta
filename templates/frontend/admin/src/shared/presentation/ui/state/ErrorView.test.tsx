// 失敗の画面のテスト: 見出しと説明を出す・ボタンで onRetry を呼ぶ (既定の文言は「再読み込み」)・onRetry が無ければボタンを出さない。

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorView } from '@/shared/presentation/ui/state/ErrorView';
import { findBanner } from '@/shared/test-support/polaris';

describe('ErrorView', () => {
  it('見出しと説明を出し、ボタンで onRetry を呼ぶ', async () => {
    const onRetry = vi.fn();
    render(<ErrorView heading="取得できません" message="通信に失敗しました" onRetry={onRetry} />);
    expect(await findBanner('取得できません')).toBeTruthy();
    expect(screen.getByText('通信に失敗しました')).toBeTruthy();
    await userEvent.click(screen.getByText('再読み込み'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('retryLabel を渡すと、そのボタンの文言になる', () => {
    render(<ErrorView heading="取得できません" retryLabel="やり直す" onRetry={() => undefined} />);
    expect(screen.getByText('やり直す')).toBeTruthy();
  });

  it('onRetry が無ければボタンを出さない', () => {
    render(<ErrorView heading="取得できません" />);
    expect(screen.queryByText('再読み込み')).toBeNull();
  });
});
