// 日付欄 (s-date-field)。値は YYYY-MM-DD の文字。確定 (input・change) のたびに onChange へ新しい値を返す。
// 購読は bindField と同じ形だが、ui は application を使えない (規則 ⑦) ので、ここに持つ。

import type { RefCallback } from 'react';

export interface DateFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function DateField({ label, value, onChange }: DateFieldProps) {
  const bind: RefCallback<HTMLElement> = (element) => {
    if (element === null) return undefined;
    const read = (): void => onChange(String((element as unknown as { value?: unknown }).value ?? ''));
    element.addEventListener('input', read);
    element.addEventListener('change', read);
    return () => {
      element.removeEventListener('input', read);
      element.removeEventListener('change', read);
    };
  };
  return <s-date-field label={label} value={value} ref={bind} />;
}
