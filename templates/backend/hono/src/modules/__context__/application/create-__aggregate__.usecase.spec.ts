// ユースケースの単体テストの雛形。port はメモリ上の偽物で置き換え、エミュレータを使わずに速く回す。
// Firestore を通した確認は *.emulator.spec.ts に書く。

import { describe, expect, it } from 'vitest';
import type { __Aggregate__ } from '@/modules/__context__/domain/__aggregate__.js';
import type { __Aggregate__Repository } from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import type { TransactionRunner } from '@/shared/domain/transaction-runner.js';
import type { TransactionScope } from '@/shared/domain/transaction-scope.js';
import { Create__Aggregate__UseCase } from './create-__aggregate__.usecase.js';

class InMemory__Aggregate__Repository implements __Aggregate__Repository {
  readonly rows = new Map<string, __Aggregate__>();

  async findById(id: string): Promise<__Aggregate__ | undefined> {
    return this.rows.get(id);
  }

  async list(): Promise<ReadonlyArray<__Aggregate__>> {
    return [...this.rows.values()];
  }

  async save(entity: __Aggregate__): Promise<void> {
    this.rows.set(entity.id, entity);
  }
}

const runner: TransactionRunner = { run: (fn) => fn({} as TransactionScope) };

function setup() {
  const repository = new InMemory__Aggregate__Repository();
  return { repository, useCase: new Create__Aggregate__UseCase(repository, runner, () => 'a-new') };
}

describe('Create__Aggregate__UseCase', () => {
  it('開いた状態で保存し、View を返す', async () => {
    const { repository, useCase } = setup();
    const result = await useCase.execute({ name: ' 名前 ' });
    expect(result).toEqual({ ok: true, value: { id: 'a-new', name: '名前', status: 'open' } });
    expect(repository.rows.get('a-new')?.status).toBe('open');
  });

  it.each(['', '   ', 'x'.repeat(41)])('意味の誤り (名前の長さ) は invalid で、保存しない (%j)', async (name) => {
    const { repository, useCase } = setup();
    const result = await useCase.execute({ name });
    expect(result.ok ? null : result.error.kind).toBe('invalid');
    expect(repository.rows.size).toBe(0);
  });
});
