// 日付欄のテスト: ラベルと値を出し、確定で新しい値を onChange に返す。

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from '@/shared/presentation/ui/DateField';

describe('DateField', () => {
  it('値を属性で出す', () => {
    const { container } = render(<DateField label="期日" value="2026-10-18" onChange={() => undefined} />);
    const field = container.querySelector('s-date-field');
    expect(field?.getAttribute('label')).toBe('期日');
    expect(field?.getAttribute('value')).toBe('2026-10-18');
  });

  it('確定で新しい値を 1 回 onChange に返す', () => {
    const onChange = vi.fn();
    const { container } = render(<DateField label="期日" value="2026-10-18" onChange={onChange} />);
    const field = container.querySelector('s-date-field') as HTMLElement & { value: string };
    field.value = '2026-10-20';
    fireEvent(field, new Event('change'));
    expect(onChange.mock.calls).toEqual([['2026-10-20']]);
  });
});
