// 件数の表示 (例: 3 件、打ち切られた 100+ 件)。truncated (サーバが打ち切った) のときだけ「n+」と出す。
// ちょうど上限の件数でも、打ち切られていなければ「+」は付けない。単位は既定で「件」。

export interface CountLabelProps {
  readonly count: number;
  /** サーバが上限で打ち切ったか。true なら「count+」。省くと false。 */
  readonly truncated?: boolean;
  readonly unit?: string;
}

export function CountLabel({ count, truncated = false, unit = '件' }: CountLabelProps) {
  return <s-text>{`${count}${truncated ? '+' : ''} ${unit}`}</s-text>;
}
