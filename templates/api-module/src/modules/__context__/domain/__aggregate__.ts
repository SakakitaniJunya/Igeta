import { DomainError, Result, err, ok } from '@/shared/kernel/result';
import { TenantId } from '@/shared/kernel/tenant-id';
import { __Aggregate__CreatedEvent } from '@/modules/__context__/domain/events/__aggregate__-created.event';
import { __Aggregate__Id } from '@/modules/__context__/domain/value-objects/__aggregate__-id';

/** 列挙は enum ではなく union type で表す (図では <<enumeration>> を付けた class として描く)。 */
export type __Aggregate__Status = 'draft' | 'confirmed' | 'cancelled';

const ALLOWED: Readonly<Record<__Aggregate__Status, readonly __Aggregate__Status[]>> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  cancelled: [],
};

export class __Aggregate__ {
  private readonly pending: __Aggregate__CreatedEvent[] = [];

  private constructor(
    readonly id: __Aggregate__Id,
    readonly tenantId: TenantId,
    private currentStatus: __Aggregate__Status,
  ) {}

  static create(id: __Aggregate__Id, tenantId: TenantId, now: Date): __Aggregate__ {
    const created = new __Aggregate__(id, tenantId, 'draft');
    created.pending.push(
      new __Aggregate__CreatedEvent(tenantId.value, now, { __aggregateCamel__Id: id.value }),
    );
    return created;
  }

  /** 永続層からの復元。不変条件を再検証してから組み立てる。 */
  static restore(
    id: __Aggregate__Id,
    tenantId: TenantId,
    status: __Aggregate__Status,
  ): __Aggregate__ {
    return new __Aggregate__(id, tenantId, status);
  }

  get status(): __Aggregate__Status {
    return this.currentStatus;
  }

  transitionTo(next: __Aggregate__Status): Result<void> {
    if (!ALLOWED[this.currentStatus].includes(next)) {
      return err(
        new DomainError('__AGGREGATE___TRANSITION_FORBIDDEN', '許可されていない状態遷移', {
          from: this.currentStatus,
          to: next,
        }),
      );
    }
    this.currentStatus = next;
    return ok(undefined);
  }

  /** 発生済みイベントを取り出す (取り出したら空にする)。publish は application 層の責務。 */
  pullEvents(): readonly __Aggregate__CreatedEvent[] {
    return this.pending.splice(0, this.pending.length);
  }
}
