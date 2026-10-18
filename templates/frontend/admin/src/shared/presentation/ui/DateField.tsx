// 日付欄 (s-date-field)。値は YYYY-MM-DD の文字。確定 (input・change) のたびに onChange へ新しい値を返す。

import { useBindField } from '@/shared/presentation/bind-field';

export interface DateFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function DateField({ label, value, onChange }: DateFieldProps) {
  const bind = useBindField(onChange);
  return <s-date-field label={label} value={value} ref={bind} />;
}
