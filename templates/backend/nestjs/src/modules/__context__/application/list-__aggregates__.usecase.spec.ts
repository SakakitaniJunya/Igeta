import { describe, expect, it } from 'vitest';
import { LIST_LIMIT, List__Aggregate__ItemsUseCase } from '@/modules/__context__/application/list-__aggregates__.usecase.js';
import { __Aggregate__, type __Aggregate__Status } from '@/modules/__context__/domain/__aggregate__.js';
import type {
  List__Aggregate__Query,
  __Aggregate__Repository,
} from '@/modules/__context__/domain/ports/__aggregate__.repository.port.js';
import { __Aggregate__Name } from '@/modules/__context__/domain/value-objects/__aggregate__-name.js';

function make(id: string, status: __Aggregate__Status): __Aggregate__ {
  return new __Aggregate__({ id, name: __Aggregate__Name.create(`名前-${id}`), status });
}

/** status で絞り、limit で切るだけの偽物。渡された query も控える。 */
class InMemory__Aggregate__Repository implements __Aggregate__Repository {
  readonly queries: List__Aggregate__Query[] = [];

  constructor(private readonly rows: ReadonlyArray<__Aggregate__>) {}

  async findById(): Promise<__Aggregate__ | undefined> {
    return undefined;
  }

  async list(query: List__Aggregate__Query): Promise<ReadonlyArray<__Aggregate__>> {
    this.queries.push(query);
    return this.rows.filter((row) => query.status === undefined || row.status === query.status).slice(0, query.limit);
  }

  async save(): Promise<void> {}
}

describe('List__Aggregate__ItemsUseCase', () => {
  it('status を省くと全部返す', async () => {
    const useCase = new List__Aggregate__ItemsUseCase(new InMemory__Aggregate__Repository([make('a-1', 'open'), make('a-2', 'closed')]));
    const result = await useCase.execute({});
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          { id: 'a-1', name: '名前-a-1', status: 'open' },
          { id: 'a-2', name: '名前-a-2', status: 'closed' },
        ],
        truncated: false,
      },
    });
  });

  it('status で絞る', async () => {
    const useCase = new List__Aggregate__ItemsUseCase(new InMemory__Aggregate__Repository([make('a-1', 'open'), make('a-2', 'closed')]));
    const result = await useCase.execute({ status: 'closed' });
    expect(result.ok ? result.value.items.map((item) => item.id) : null).toEqual(['a-2']);
  });

  it('上限ちょうどなら truncated は false', async () => {
    const rows = Array.from({ length: LIST_LIMIT }, (_, i) => make(`a-${i}`, 'open'));
    const result = await new List__Aggregate__ItemsUseCase(new InMemory__Aggregate__Repository(rows)).execute({});
    expect(result.ok ? [result.value.items.length, result.value.truncated] : null).toEqual([LIST_LIMIT, false]);
  });

  it('上限を超えたら上限で切って truncated は true (1 件多く読む)', async () => {
    const rows = Array.from({ length: LIST_LIMIT + 5 }, (_, i) => make(`a-${i}`, 'open'));
    const repository = new InMemory__Aggregate__Repository(rows);
    const result = await new List__Aggregate__ItemsUseCase(repository).execute({});
    expect(result.ok ? [result.value.items.length, result.value.truncated] : null).toEqual([LIST_LIMIT, true]);
    expect(repository.queries[0]?.limit).toBe(LIST_LIMIT + 1);
  });
});
