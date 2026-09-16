// ドメインイベントの配信面。共有カーネルに置き、各コンテキストは adapter を注入して使う。
// 配信は application 層の責務 (集約は pullEvents で取り出させるだけ)。

import { DomainEvent } from '@/shared/kernel/domain-event';
import { Result } from '@/shared/kernel/result';

export interface EventPublisherPort {
  publish(events: readonly DomainEvent[]): Promise<Result<void>>;
}

/** DI トークン。application は adapter の実体を知らないまま注入を受ける。 */
export const EVENT_PUBLISHER = Symbol('EventPublisherPort');
