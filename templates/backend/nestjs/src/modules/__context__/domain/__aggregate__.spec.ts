// ドメインのテストの雛形。domain は純粋な TypeScript なので、偽物も無しで直接確かめる。

import { describe, expect, it } from 'vitest';
import { __Aggregate__ } from './__aggregate__.js';
import { __Aggregate__AlreadyClosedError } from './errors/__aggregate__-already-closed.error.js';
import { __Aggregate__Name } from './value-objects/__aggregate__-name.js';

function make(overrides: Partial<ConstructorParameters<typeof __Aggregate__>[0]> = {}): __Aggregate__ {
  return new __Aggregate__({ id: 'a-1', name: __Aggregate__Name.create('名前'), status: 'open', ...overrides });
}

describe('__Aggregate__.close', () => {
  it('閉じた新しいインスタンスを返し、元は変えない', () => {
    const open = make();
    const closed = open.close();
    expect(closed.status).toBe('closed');
    expect(closed.id).toBe('a-1');
    expect(open.status).toBe('open');
  });

  it('閉じ済みを閉じるとドメインエラー', () => {
    expect(() => make({ status: 'closed' }).close()).toThrow(__Aggregate__AlreadyClosedError);
  });
});
