/** testing 入口。契約テストと InMemory 実装を公開する。 */
export { describeRepositoryContract } from './describe-repository-contract';
export type {
  ContractFixtures,
  ContractOptions,
  ContractState,
  ContractSubject,
  PlantMalformed,
} from './contract-types';
export { InMemoryRepository } from './in-memory-repository';
export type { InMemoryRepositoryOptions } from './in-memory-repository';
export { InMemoryStore } from './in-memory-store';
export { InMemoryTransactionRunner } from './in-memory-transaction-runner';
export { describeEmulator, EMULATOR_PROJECT } from './emulator';
export { describePostgres } from './postgres-harness';
