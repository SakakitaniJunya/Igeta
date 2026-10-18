import { describe, expect, it } from 'vitest';
import { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import { __Aggregate__AlreadyClosedError } from '@/modules/__context__/domain/errors/__aggregate__-already-closed.error.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';

function make(status: 'open' | 'closed' = 'open'): __Aggregate__ {
  return new __Aggregate__({ id: 'a-1', name: __Aggregate__Name.create('名前'), status });
}

describe('__Aggregate__.close', () => {
  it('閉じた新しいインスタンスを返し、元は変えない', () => {
    const open = make();
    const closed = open.close();
    expect(closed.status).toBe('closed');
    expect(closed.id).toBe('a-1');
    expect(closed.name.value).toBe('名前');
    expect(open.status).toBe('open');
  });

  it('閉じ済みを閉じるとドメインエラー', () => {
    expect(() => make('closed').close()).toThrow(__Aggregate__AlreadyClosedError);
  });
});
