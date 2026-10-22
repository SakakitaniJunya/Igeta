import { describeRepositoryContract } from '#testing/contract/describe-repository-contract';
import { memoContractFixtures } from '#testing/fixtures/memo';
import { describePostgres } from '#testing/harness/postgres';
import {
  POSTGRES_MALFORMED_KINDS,
  createPostgresMemoParts,
  createPostgresMemoSubject,
} from '#testing/fixtures/postgres-memo-parts';

describePostgres('SqlRepository (Postgres 16)', () => {
  // TST-501: 契約 C1〜C12 を Postgres で通す
  describeRepositoryContract({
    name: 'memos (Postgres)',
    setup: () => createPostgresMemoSubject(createPostgresMemoParts()),
    malformedKinds: POSTGRES_MALFORMED_KINDS,
    fixtures: memoContractFixtures,
  });
});
