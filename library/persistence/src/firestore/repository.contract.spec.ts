import { describeRepositoryContract } from '../testing/describe-repository-contract';
import { describeEmulator } from '../testing/emulator';
import { createMemo, createMemoFilter, isSameMemoContent, MALFORMED_MEMO_RECORDS } from '../testing/memo-fixture';
import { createFirestoreMemoParts, createFirestoreMemoSubject } from './firestore-memo-parts';

describeEmulator('FirestoreRepository (Firestore emulator)', () => {
  // TST-401: 契約 C1〜C10 を Firestore で通す
  describeRepositoryContract({
    name: 'memos (Firestore)',
    setup: () => createFirestoreMemoSubject(createFirestoreMemoParts()),
    malformedKinds: Object.keys(MALFORMED_MEMO_RECORDS),
    fixtures: { createEntity: createMemo, filterByState: createMemoFilter, isSameContent: isSameMemoContent },
  });
});
