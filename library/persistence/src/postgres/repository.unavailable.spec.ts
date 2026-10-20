import { expect, it } from 'vitest';
import { captureThrown } from '../testing/capture-thrown';
import { createPostgresMemoParts } from './postgres-memo-parts';

// 何も待ち受けていない port。接続は拒否される
const UNREACHABLE_URL = 'postgres://postgres@127.0.0.1:1/postgres';

it('TST-706 Postgres に接続できないとき findById は unavailable を投げる', async () => {
  const { db, repository } = createPostgresMemoParts(UNREACHABLE_URL);

  const thrown = await captureThrown(() => repository.findById('memo-1'));

  expect(thrown).toMatchObject({ kind: 'unavailable' });
  await db.destroy();
});
