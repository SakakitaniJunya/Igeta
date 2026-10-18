// 一覧を確かめる: 上限を超えたら打ち切って truncated:true / ちょうど上限なら false / 上限より 1 件多く読む / status で絞る。

import { describe, expect, it } from 'vitest';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';
import { unprocessable } from '@/shared/domain/app-error.js';
import { LIST_LIMIT, List__Aggregate__ItemsUseCase } from './list-__aggregates__.usecase.js';

class FakeRepository implements __Aggregate__Repository {
  readonly rows: __Aggregate__[] = [];
  lastLimit: number | undefined;

  async findById(): Promise<__Aggregate__ | undefined> {
    return undefined;
  }

  async save(): Promise<void> {}

  async list(status: __Aggregate__Status | undefined, limit: number): Promise<ReadonlyArray<__Aggregate__>> {
    this.lastLimit = limit;
    return this.rows.filter((row) => status === undefined || row.status === status).slice(0, limit);
  }
}

function make(id: string, status: __Aggregate__Status = 'open'): __Aggregate__ {
  return new __Aggregate__({ id, name: __Aggregate__Name.create(`name-${id}`), status });
}

function setup(count: number, limit: number) {
  const repository = new FakeRepository();
  for (let i = 0; i < count; i += 1) repository.rows.push(make(`a-${i}`));
  return { repository, useCase: new List__Aggregate__ItemsUseCase(repository, limit) };
}

describe('List__Aggregate__ItemsUseCase', () => {
  it('上限を超えたら limit 件で打ち切り、truncated:true', async () => {
    const { useCase } = setup(3, 2);
    const result = await useCase.execute({});
    expect(result.ok ? result.value.items.map((item) => item.id) : null).toEqual(['a-0', 'a-1']);
    expect(result.ok && result.value.truncated).toBe(true);
  });

  it('ちょうど上限なら全部返し、truncated:false', async () => {
    const { useCase } = setup(2, 2);
    const result = await useCase.execute({});
    expect(result.ok && result.value.items).toHaveLength(2);
    expect(result.ok && result.value.truncated).toBe(false);
  });

  it('上限より 1 件多く読んで超過を見分ける', async () => {
    const { repository, useCase } = setup(0, 5);
    await useCase.execute({});
    expect(repository.lastLimit).toBe(6);
  });

  it('0 件は空の配列で truncated:false', async () => {
    const { useCase } = setup(0, 5);
    expect(await useCase.execute({})).toEqual({ ok: true, value: { items: [], truncated: false } });
  });

  it('status で絞る', async () => {
    const { repository, useCase } = setup(0, 5);
    repository.rows.push(make('a-open'), make('a-closed', 'closed'));
    const result = await useCase.execute({ status: 'closed' });
    expect(result.ok ? result.value.items.map((item) => item.id) : null).toEqual(['a-closed']);
  });

  it('保存済みの doc が壊れていて repository が unprocessable を投げたら、Result の失敗で返す', async () => {
    const { repository, useCase } = setup(0, 5);
    repository.list = async () => {
      throw unprocessable('stored __aggregate__ is malformed', { id: 'a-bad' });
    };
    const result = await useCase.execute({});
    expect(result.ok ? null : [result.error.kind, result.error.detail]).toEqual(['unprocessable', { id: 'a-bad' }]);
  });

  it('上限の定数は正の整数', () => {
    expect(Number.isInteger(LIST_LIMIT) && LIST_LIMIT >= 1).toBe(true);
  });
});
