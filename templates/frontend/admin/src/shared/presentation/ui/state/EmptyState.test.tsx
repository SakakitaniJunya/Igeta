// 空の状態のテスト: 見出し・説明・次の行動のボタン (children) を出す。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/shared/presentation/ui/state/EmptyState';

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

  it('説明と操作を省くと、見出しだけを出す', () => {
    render(<EmptyState heading="まだ何もありません" />);
    expect(screen.getByText('まだ何もありません')).toBeTruthy();
  });
});
