// 入力欄の購読のテスト: 打つたび・確定のたびに値を 1 回ずつ渡す。購読を外すと渡さない。

import { describe, expect, it, vi } from 'vitest';
import { bindField } from '@/shared/application/bind-field';

describe('bindField', () => {
  it('input と change のそれぞれで、現在の値を 1 回ずつ渡す', () => {
    const onValue = vi.fn();
    const element = document.createElement('s-text-field') as HTMLElement & { value: string };
    bindField(onValue)(element);

    element.value = '茅';
    element.dispatchEvent(new Event('input'));
    element.value = '茅野';
    element.dispatchEvent(new Event('change'));

    expect(onValue.mock.calls).toEqual([['茅'], ['茅野']]);
  });

  it('cleanup で購読を外すと、以後は渡さない', () => {
    const onValue = vi.fn();
    const element = document.createElement('s-text-field') as HTMLElement & { value: string };
    const detach = bindField(onValue)(element) as () => void;

    detach();
    element.value = 'x';
    element.dispatchEvent(new Event('change'));

    expect(onValue).not.toHaveBeenCalled();
  });
});
