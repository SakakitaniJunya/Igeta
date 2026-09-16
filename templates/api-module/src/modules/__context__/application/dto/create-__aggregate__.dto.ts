/**
 * application 層の入出力。HTTP / NestJS / Prisma のどの型にも依存しない素の TypeScript。
 * presentation は api-contract の生成型からこの型へ詰め替える (逆向きの依存を作らない)。
 */
export type Create__Aggregate__Input = {
  readonly tenantId: string;
  readonly __aggregateCamel__Id: string;
};

export type Create__Aggregate__Output = {
  readonly __aggregateCamel__Id: string;
  readonly status: string;
};
