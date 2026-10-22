import { describeRepositoryContract } from '#testing/contract/describe-repository-contract';
import { describeEmulator } from '#testing/harness/emulator';
import { MALFORMED_MEMO_RECORDS, memoContractFixtures } from '#testing/fixtures/memo';
import { createFirestoreMemoParts, createFirestoreMemoSubject } from '#testing/fixtures/firestore-memo-parts';

describeEmulator('FirestoreRepository (Firestore emulator)', () => {
  // TST-401: 契約 C1〜C12 を Firestore で通す
  describeRepositoryContract({
    name: 'memos (Firestore)',
    setup: () => createFirestoreMemoSubject(createFirestoreMemoParts()),
    malformedKinds: Object.keys(MALFORMED_MEMO_RECORDS),
    fixtures: memoContractFixtures,
  });
});
