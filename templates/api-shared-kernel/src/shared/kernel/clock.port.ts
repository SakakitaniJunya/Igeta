// 現在時刻はドメインから直接 Date を呼ばず port 経由にする (テスト可能性 / 利用期間の境界検証)。
export interface ClockPort {
  now(): Date;
}

export const CLOCK = Symbol('ClockPort');
