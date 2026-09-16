/**
 * application 層の入出力。HTTP / NestJS / Prisma のどの型にも依存しない素の TypeScript。
 * presentation は api-contract の生成型からこの型へ詰め替える (逆向きの依存を作らない)。
 */
export type CreateReservationInput = {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly timeSlotId: string;
};

export type CreateReservationOutput = {
  readonly reservationId: string;
  readonly timeSlotId: string;
  readonly status: string;
};
