import type { DomainEvent } from '@/shared/kernel/domain-event';
import type { EventPublisherPort } from '@/shared/kernel/event-publisher.port';
import { Result, ok } from '@/shared/kernel/result';

/**
 * 学習用の配信先。購読側が無いため、配信済みイベントを順に溜めるだけ。
 * 本番の配信 (Pub/Sub 等) の代わりにはならない。
 */
export class InMemoryEventPublisher implements EventPublisherPort {
  private readonly log: DomainEvent[] = [];

  async publish(events: readonly DomainEvent[]): Promise<Result<void>> {
    this.log.push(...events);
    return ok(undefined);
  }

  /** 配信済みイベントの一覧 (検査と CLI 表示用)。 */
  published(): readonly DomainEvent[] {
    return [...this.log];
  }
}
