import { describe, expect, it } from 'vitest';
import { captureThrown } from '../testing/capture-thrown';
import { createMemo, memoMapper } from '../testing/memo-fixture';
import type { MemoRecord } from '../testing/memo-fixture';
import { err, ok } from './result';
import { unprocessable } from './app-error';
import { readStored } from './mapper';
import type { Mapper } from './mapper';

describe('mapper', () => {
  it('TST-113 有効な memo の record を fromRecord して toRecord に戻すとき元と同じ内容になる', () => {
    const record: MemoRecord = { title: '下書き', state: 'draft', note: undefined };

    const restored = memoMapper.fromRecord('memo-1', record);

    expect(restored).toEqual(ok(createMemo('memo-1', 'draft')));
    expect(memoMapper.toRecord(createMemo('memo-1', 'draft'))).toEqual(record);
  });
});

describe('readStored', () => {
  const failingMapper: Mapper<string, string> = {
    toRecord: (entity) => entity,
    fromRecord: () => err(unprocessable('壊れている')),
  };

  it('TST-114 mapper が err を返すとき id 付きの unprocessable を投げる', async () => {
    const thrown = await captureThrown(() => readStored(failingMapper, 'id1', 'raw'));

    expect(thrown).toMatchObject({ kind: 'unprocessable' });
    expect(thrown).toMatchObject({ detail: { id: 'id1' } });
  });

  it('TST-115 mapper が例外を投げるとき包まずそのまま投げる', async () => {
    const boom = new Error('boom');
    const throwingMapper: Mapper<string, string> = {
      toRecord: (entity) => entity,
      fromRecord: () => {
        throw boom;
      },
    };

    const thrown = await captureThrown(() => readStored(throwingMapper, 'id1', 'raw'));

    expect(thrown).toBe(boom);
  });
});
