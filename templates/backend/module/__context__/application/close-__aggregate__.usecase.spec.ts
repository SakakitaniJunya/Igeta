// ユースケースの単体テストの雛形。port はメモリ上の偽物で置き換え、エミュレータを使わずに速く回す。
// Firestore を通した確認は __tests__/*.emulator.spec.ts に書く。

import { describe, expect, it } from 'vitest';
import type { TransactionRunner } from '../../../shared/kernel/transaction-runner.js';
import type { TransactionScope } from '../../../shared/kernel/transaction-scope.js';
import { __Aggregate__ } from '../domain/__aggregate__.js';
import type { __Aggregate__Repository } from '../domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '../domain/value-objects/__aggregate__-name.js';
import { Close__Aggregate__UseCase } from './close-__aggregate__.usecase.js';

class InMemory__Aggregate__Repository implements __Aggregate__Repository {
  readonly rows = new Map<string, __Aggregate__>();

  async findById(id: string): Promise<__Aggregate__ | undefined> {
    return this.rows.get(id);
  }

  async save(entity: __Aggregate__): Promise<void> {
    this.rows.set(entity.id, entity);
  }
}

const runner: TransactionRunner = { run: (fn) => fn({} as TransactionScope) };

function setup(rows: ReadonlyArray<__Aggregate__> = []) {
  const repository = new InMemory__Aggregate__Repository();
  for (const row of rows) repository.rows.set(row.id, row);
  return { repository, useCase: new Close__Aggregate__UseCase(repository, runner) };
}

const OPEN = new __Aggregate__({ id: 'a-1', name: __Aggregate__Name.create('名前'), status: 'open' });

describe('Close__Aggregate__UseCase', () => {
  it('開いているものを閉じて保存する', async () => {
    const { repository, useCase } = setup([OPEN]);
    const result = await useCase.execute({ id: 'a-1' });
    expect(result).toEqual({ ok: true, value: { id: 'a-1', status: 'closed' } });
    expect(repository.rows.get('a-1')?.status).toBe('closed');
  });

  it('形の悪い id は invalid で、読みに行かない', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({ id: '../x' });
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });

  it('無ければ not_found', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({ id: 'missing' });
    expect(result.ok ? null : result.error.kind).toBe('not_found');
  });

  it('閉じ済みなら conflict で、保存しない', async () => {
    const closed = OPEN.close();
    const { repository, useCase } = setup([closed]);
    const result = await useCase.execute({ id: 'a-1' });
    expect(result.ok ? null : result.error.kind).toBe('conflict');
    expect(repository.rows.get('a-1')).toBe(closed);
  });
});
