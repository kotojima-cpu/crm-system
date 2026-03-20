/**
 * Local Queue
 *
 * 実送信を行わない。
 * logger に構造化出力し、メモリに簡易保持する。
 *
 * 対象環境: local / test
 */

import { logger } from "@/shared/logging";
import type { QueuePublisher } from "./interface";
import type { QueuePublishInput, QueuePublishResult } from "./types";

export class LocalQueue implements QueuePublisher {
  /** テスト用: publish されたメッセージを保持 */
  public readonly messages: QueuePublishInput[] = [];

  async publish(input: QueuePublishInput): Promise<QueuePublishResult> {
    this.messages.push(input);

    logger.info("[LocalQueue] Queue publish (dry-run)", {
      queueEventType: input.eventType,
      queueRequestId: input.requestId,
      queueTenantId: input.tenantId,
      queueExecutionContext: input.executionContext,
      queueDeduplicationKey: input.deduplicationKey ?? null,
      queueOrderingKey: input.orderingKey ?? null,
    });

    return {
      ok: true,
      providerMessageId: `local-queue-dry-run-${Date.now()}`,
      dryRun: true,
    };
  }
}
