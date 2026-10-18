// 登録の入力欄のテスト: 空の名称は送らずに誤りを出す・通れば値を onSubmit に渡す・送信中は押せない・送っても入力は残る。

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { __Feature__Form } from '@/features/__feature__/presentation/components/__Feature__Form';
import { findBanner } from '@/shared/test-support/polaris';

function typeName(container: HTMLElement, text: string): HTMLElement & { value: string } {
  const field = container.querySelector('s-text-field[label="名称"]') as HTMLElement & { value: string };
  field.value = text;
  fireEvent(field, new Event('input'));
  return field;
}

describe('__Feature__Form', () => {
  it('空の名称は送らず、誤りを出す', async () => {
    const onSubmit = vi.fn();
    render(<__Feature__Form saving={false} onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.click(screen.getByText('登録', { selector: 's-button' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await findBanner('入力に誤りがあります。保存していません')).toBeTruthy();
    expect(screen.getByText('名称は 1〜40 文字で入れてください')).toBeTruthy();
  });

  it('通れば、前後の空白を除いた名称を onSubmit に渡す', async () => {
    const onSubmit = vi.fn();
    const { container } = render(<__Feature__Form saving={false} onSubmit={onSubmit} onCancel={() => undefined} />);
    typeName(container, ' 茅野 ');
    await userEvent.click(screen.getByText('登録', { selector: 's-button' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: '茅野' });
  });

  it('送っても入力は残る (失敗したときに直せるように)', async () => {
    const { container } = render(<__Feature__Form saving={false} onSubmit={() => undefined} onCancel={() => undefined} />);
    const field = typeName(container, '茅野');
    await userEvent.click(screen.getByText('登録', { selector: 's-button' }));
    expect(field.value).toBe('茅野');
  });

  it('送信中は登録もやめるも押せない', () => {
    render(<__Feature__Form saving onSubmit={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByText('登録', { selector: 's-button' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('やめる', { selector: 's-button' }).hasAttribute('disabled')).toBe(true);
  });

  it('やめるを押すと onCancel を呼ぶ', async () => {
    const onCancel = vi.fn();
    render(<__Feature__Form saving={false} onSubmit={() => undefined} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('やめる', { selector: 's-button' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
