// 入力欄の購読のテスト: 打つたび・確定のたびに値を 1 回ずつ渡す。購読を外すと渡さない。

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bindField, useBindField } from '@/shared/presentation/bind-field';

describe('bindField', () => {
  it('input と change のそれぞれで、現在の値を 1 回ずつ渡す', () => {
    const onValue = vi.fn();
    const element = document.createElement('s-text-field') as HTMLElement & { value: string };
    bindField(onValue)(element);

    element.value = '見';
    element.dispatchEvent(new Event('input'));
    element.value = '見本';
    element.dispatchEvent(new Event('change'));

    expect(onValue.mock.calls).toEqual([['見'], ['見本']]);
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

describe('useBindField', () => {
  it('再描画しても同じ ref を返し、購読は 1 回だけ付く (最新の onValue を呼ぶ)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onValue }) => useBindField(onValue), { initialProps: { onValue: first } });
    const ref = result.current;
    const element = document.createElement('s-text-field') as HTMLElement & { value: string };
    const add = vi.spyOn(element, 'addEventListener');
    ref(element);

    rerender({ onValue: second });
    expect(result.current).toBe(ref);

    element.value = '見本';
    element.dispatchEvent(new Event('change'));
    expect(add).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls).toEqual([['見本']]);
  });
});
