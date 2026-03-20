/**
 * Local EventBus
 *
 * 実送信を行わない。logger に構造化出力する。
 *
 * 対象環境: local / test
 */

import { logger } from "@/shared/logging";
import type { EventBusPublisher } from "./interface";
import type { EventBusPublishInput, EventBusPublishResult } from "./types";

export class LocalEventBus implements EventBusPublisher {
  /** テスト用: publish されたイベントを保持 */
  public readonly events: EventBusPublishInput[] = [];

  async publish(input: EventBusPublishInput): Promise<EventBusPublishResult> {
    this.events.push(input);

    logger.info("[LocalEventBus] EventBus publish (no-op)", {
      eventBusSource: input.source,
      eventBusDetailType: input.detailType,
      eventBusRequestId: input.requestId,
      eventBusTenantId: input.tenantId,
      eventBusExecutionContext: input.executionContext,
    });

    return { ok: true, providerMessageId: `local-eventbus-${Date.now()}` };
  }
}
