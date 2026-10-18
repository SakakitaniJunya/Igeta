// 件数の表示 (例: 3 件、上限に届いた 200+ 件)。count が limit に届いたら「limit+」と出す。
// 上限の判断はここで済ませる。単位は既定で「件」。

export interface CountLabelProps {
  readonly count: number;
  /** 一覧の上限。count がこれに届いたら「上限+」。省くと上限の表示をしない。 */
  readonly limit?: number;
  readonly unit?: string;
}

export function CountLabel({ count, limit, unit = '件' }: CountLabelProps) {
  const shown = limit !== undefined && count >= limit ? `${limit}+` : String(count);
  return <s-text>{`${shown} ${unit}`}</s-text>;
}
