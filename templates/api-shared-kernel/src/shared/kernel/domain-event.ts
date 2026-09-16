// コンテキスト間連携はこのイベント型だけを共有面とする。
// 他 module の entity / repository を直接 import することは禁止。

export interface DomainEvent {
  /** `<context>.<aggregate>.<past-tense>` 形式で固定する */
  readonly name: string;
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}
