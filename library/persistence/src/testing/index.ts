/** testing 入口。契約テストと InMemory 実装を公開する。 */
export { describeRepositoryContract } from '#testing/contract/describe-repository-contract';
export type {
  ContractFixtures,
  ContractOptions,
  ContractState,
  ContractSubject,
  PlantMalformed,
} from '#testing/contract/types';
export { InMemoryRepository } from '#testing/in-memory/repository';
export type { InMemoryRepositoryOptions } from '#testing/in-memory/repository';
export { InMemoryStore } from '#testing/in-memory/store';
export { InMemoryTransactionRunner } from '#testing/in-memory/transaction-runner';
export { describeEmulator, EMULATOR_PROJECT } from '#testing/harness/emulator';
export { describePostgres } from '#testing/harness/postgres';
