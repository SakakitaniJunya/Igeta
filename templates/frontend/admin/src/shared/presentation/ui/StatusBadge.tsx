// 色 (tone) と字だけの印。意味を知らない小さな見た目。状態 → 語の表は feature が持ち、語と tone をここへ渡す。

export interface StatusBadgeProps {
  readonly label: string;
  /** 省くと tone なし (灰色の印)。 */
  readonly tone?: 'success' | 'warning' | 'critical' | 'info';
}

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return tone === undefined ? <s-badge>{label}</s-badge> : <s-badge tone={tone}>{label}</s-badge>;
}
