/**
 * キャンセルの入出力。draft のキャンセルは枠を消費していないため残数を読まない。
 * 読んでいない値を 0 や null で埋めず、返却したか否かだけを返す (原則: 無いものを書かない)。
 */
export type CancelReservationInput = {
  readonly tenantId: string;
  readonly reservationId: string;
};

export type CancelReservationOutput = {
  readonly reservationId: string;
  readonly status: string;
  readonly releasedCapacity: boolean;
};
