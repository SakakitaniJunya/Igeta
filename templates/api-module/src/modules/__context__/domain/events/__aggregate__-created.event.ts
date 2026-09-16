import { DomainEvent } from '@/shared/kernel/domain-event';

/** コンテキスト間へ出る唯一の形。他 module はこのイベントだけを購読する。 */
export class __Aggregate__CreatedEvent implements DomainEvent {
  readonly name = '__context__.__aggregate__.created';

  constructor(
    readonly tenantId: string,
    readonly occurredAt: Date,
    readonly payload: Readonly<{ __aggregateCamel__Id: string }>,
  ) {}
}
