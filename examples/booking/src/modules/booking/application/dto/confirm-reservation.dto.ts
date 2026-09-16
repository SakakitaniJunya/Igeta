/** 確定の入出力。枠の残数は確定後の値を返す (呼び出し側が再問い合わせしないで済む)。 */
export type ConfirmReservationInput = {
  readonly tenantId: string;
  readonly reservationId: string;
};

export type ConfirmReservationOutput = {
  readonly reservationId: string;
  readonly status: string;
  readonly remainingCapacity: number;
};
