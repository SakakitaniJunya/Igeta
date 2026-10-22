// 読み込み中の画面のテスト: 読み上げに載る「読み込んでいます」を、対象の名前つきで出す。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingView } from '@/shared/presentation/ui/state/LoadingView';

describe('LoadingView', () => {
  it('読み上げに載る「読み込んでいます」を出す', () => {
    render(<LoadingView subject="項目を" />);
    expect(screen.getByRole('status').textContent).toBe('項目を読み込んでいます');
  });
});
