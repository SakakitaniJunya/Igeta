// 保存の失敗の知らせのテスト: 文を出す・details の項目名を並べる (文字だけ。文字でないものは出さない)・サーバの message は出さない。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveErrorBanner } from '@/shared/presentation/ui/SaveErrorBanner';
import { findBanner } from '@/shared/test-support/polaris';

describe('SaveErrorBanner', () => {
  it('見出しと、呼び出し側が決めた 1 文を出す', async () => {
    render(<SaveErrorBanner error={null} message="もう一度お試しください" />);
    expect(await findBanner('保存できませんでした')).toBeTruthy();
    expect(screen.getByText('もう一度お試しください')).toBeTruthy();
  });

  it('details の文字の項目名を並べ、文字でないものは出さない', () => {
    const error = { code: 'VALIDATION_FAILED', message: 'x', details: ['名称', '点検日数', { field: 'x' }, 42] };
    render(<SaveErrorBanner error={error} />);
    expect(screen.getByText('名称')).toBeTruthy();
    expect(screen.getByText('点検日数')).toBeTruthy();
    expect(document.querySelectorAll('s-list-item')).toHaveLength(2);
  });

  it('サーバの message は画面に出さない', () => {
    render(<SaveErrorBanner error={{ code: 'INTERNAL', message: 'stack trace here' }} />);
    expect(screen.queryByText('stack trace here')).toBeNull();
  });
});
