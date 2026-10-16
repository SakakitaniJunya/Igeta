import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { findBanner } from '../../test-support/polaris';
import { EmptyState } from './EmptyState';
import { ErrorView } from './ErrorView';
import { LoadingView } from './LoadingView';

describe('LoadingView', () => {
  it('読み上げに載る「読み込んでいます」を出す', () => {
    render(<LoadingView subject="項目を" />);
    expect(screen.getByRole('status').textContent).toBe('項目を読み込んでいます');
  });
});

describe('ErrorView', () => {
  it('見出しと説明を出し、ボタンで onRetry を呼ぶ (既定の文言は「再読み込み」)', async () => {
    const onRetry = vi.fn();
    render(<ErrorView heading="取得できません" message="通信に失敗しました" onRetry={onRetry} />);
    expect(await findBanner('取得できません')).toBeTruthy();
    expect(screen.getByText('通信に失敗しました')).toBeTruthy();
    await userEvent.click(screen.getByText('再読み込み'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('onRetry が無ければボタンを出さない', () => {
    render(<ErrorView heading="取得できません" />);
    expect(screen.queryByText('再読み込み')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('見出し・説明・次の行動を出す', () => {
    render(
      <EmptyState heading="項目が登録されていません" message="最初の項目を登録してください">
        <s-button>項目を追加</s-button>
      </EmptyState>,
    );
    expect(screen.getByText('項目が登録されていません')).toBeTruthy();
    expect(screen.getByText('最初の項目を登録してください')).toBeTruthy();
    expect(screen.getByText('項目を追加')).toBeTruthy();
  });
});
