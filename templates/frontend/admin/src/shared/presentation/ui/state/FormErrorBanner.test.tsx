// 入力の誤りの知らせのテスト: 誤りが無ければ何も出さない・誤りは全部並べる。

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormErrorBanner } from '@/shared/presentation/ui/state/FormErrorBanner';
import { findBanner } from '@/shared/test-support/polaris';

describe('FormErrorBanner', () => {
  it('誤りが無ければ何も出さない', () => {
    const { container } = render(<FormErrorBanner messages={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('誤りを全部並べる', async () => {
    render(<FormErrorBanner messages={['名称は 1〜40 文字で入れてください', '点検日数は 0〜14 の整数で入れてください']} />);
    expect(await findBanner('入力に誤りがあります。保存していません')).toBeTruthy();
    expect(screen.getByText('名称は 1〜40 文字で入れてください')).toBeTruthy();
    expect(screen.getByText('点検日数は 0〜14 の整数で入れてください')).toBeTruthy();
  });
});
