/**
 * Outbox Dispatcher
 *
 * outbox event のステータス遷移と dispatch 契約を定義する。
 * mark* 関数は DB を直接更新する（transaction 外）。
 *
 * ┌─ ステータス遷移図 ────────────────────────────────────────────────┐
 * │  pending ──► processing ──► sent                                 │
 * │                 │                                                 │
 * │                 └──► failed ──► (retry: back to pending) ──► dead│
 * │                 └──► dead                                        │
 * └────────────────────────────────────────────────────────────────────┘
 */

import { prisma } from "@/shared/db";
import { logger } from "@/shared/logging";
import type { OutboxStatus } from "./types";
import { canTransitionOutboxStatus } from "./status";
import { OutboxStatusTransitionError, OutboxDispatchError } from "./errors";
import { calculateNextRetryAt } from "@/worker/retry";

/**
 * dispatch 対象イベントの最小インターフェース。
 * outbox テーブルのレコードに対応する。
 */
export interface OutboxEventRecord {
  id: number;
  eventType: string;
  executionMode: string;
  status: OutboxStatus;
  payloadJson: string;
  availableAt: Date;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  processedAt: Date | null;
}

/**
 * dispatch ハンドラーの型。
 * executionMode ごとに実装する。
 */
export type DispatchHandler = (event: OutboxEventRecord) => Promise<void>;

/**
 * ステータスを安全に遷移させる。
 * 不正な遷移は OutboxStatusTransitionError で拒否する。
 */
function assertTransition(from: OutboxStatus, to: OutboxStatus): void {
  if (!canTransitionOutboxStatus(from, to)) {
    throw new OutboxStatusTransitionError(from, to);
  }
}

/**
 * outbox event を ID で取得する。
 */
export async function loadOutboxEventById(
  id: number,
): Promise<OutboxEventRecord | null> {
  const record = await prisma.outboxEvent.findUnique({ where: { id } });
  if (!record) return null;
  return {
    ...record,
    status: record.status as OutboxStatus,
  };
}

/**
 * outbox event を processing にマークする。
 * dispatcher がピックアップした時点で呼ぶ。
 */
export async function markOutboxProcessing(
  event: OutboxEventRecord,
): Promise<void> {
  assertTransition(event.status, "processing");

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { status: "processing", updatedAt: new Date() },
  });

  logger.info("Outbox event marked as processing", {
    outboxEventId: event.id,
    outboxEventType: event.eventType,
    outboxRetryCount: event.retryCount,
  });
}

/**
 * outbox event を sent にマークする。
 * 外部呼び出し成功時に呼ぶ。
 */
export async function markOutboxSent(
  event: OutboxEventRecord,
): Promise<void> {
  assertTransition(event.status, "sent");

  const now = new Date();
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: "sent",
      processedAt: now,
      lastError: null,
      updatedAt: now,
    },
  });

  logger.info("Outbox event marked as sent", {
    outboxEventId: event.id,
    outboxEventType: event.eventType,
  });
}

/**
 * outbox event を failed にマークする。
 * 外部呼び出し失敗時に呼ぶ。
 * retryCount を増加し、availableAt を次回 retry 時刻に設定する。
 */
export async function markOutboxFailed(
  event: OutboxEventRecord,
  errorMessage: string,
): Promise<void> {
  assertTransition(event.status, "failed");

  const newRetryCount = event.retryCount + 1;
  const nextRetryAt = calculateNextRetryAt(newRetryCount);

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: "failed",
      lastError: errorMessage,
      retryCount: newRetryCount,
      availableAt: nextRetryAt,
      updatedAt: new Date(),
    },
  });

  logger.warn("Outbox event marked as failed", {
    outboxEventId: event.id,
    outboxEventType: event.eventType,
    outboxError: errorMessage,
    outboxRetryCount: newRetryCount,
    outboxNextRetryAt: nextRetryAt.toISOString(),
  });
}

/**
 * outbox event を dead にマークする。
 * リトライ上限超過時、または人手で dead 化する時に呼ぶ。
 */
export async function markOutboxDead(
  event: OutboxEventRecord,
  reason: string,
): Promise<void> {
  assertTransition(event.status, "dead");

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: "dead",
      lastError: reason,
      updatedAt: new Date(),
    },
  });

  logger.error("Outbox event marked as dead (requires manual intervention)", undefined, {
    outboxEventId: event.id,
    outboxEventType: event.eventType,
    outboxReason: reason,
    outboxRetryCount: event.retryCount,
    outboxLastError: event.lastError,
  });
}

/**
 * outbox event を dispatch する。
 *
 * 処理フロー:
 * 1. processing にマーク
 * 2. handler を実行（外部呼び出し）
 * 3. 成功 → sent にマーク
 * 4. 失敗 → retryCount < maxRetries なら failed、超過なら dead
 */
export async function dispatchOutboxEvent(
  event: OutboxEventRecord,
  handler: DispatchHandler,
): Promise<void> {
  await markOutboxProcessing(event);
  const processingEvent = { ...event, status: "processing" as OutboxStatus };

  try {
    await handler(event);
    await markOutboxSent(processingEvent);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (event.retryCount + 1 >= event.maxRetries) {
      await markOutboxFailed(processingEvent, errorMessage);
      const failedEvent = {
        ...processingEvent,
        status: "failed" as OutboxStatus,
        retryCount: event.retryCount + 1,
      };
      await markOutboxDead(failedEvent, `Max retries exceeded: ${errorMessage}`);
    } else {
      await markOutboxFailed(processingEvent, errorMessage);
    }

    throw new OutboxDispatchError(
      `Dispatch failed for ${event.eventType}: ${errorMessage}`,
      event.eventType,
      errorMessage,
    );
  }
}

// --- executionMode 別 dispatch helper ---

/**
 * executionMode に対応する DispatchHandler を返す。
 *
 * queue    → QueuePublisher.publish()
 * email    → queue 経由で worker に委譲
 * webhook  → queue 経由で worker に委譲
 * eventbus → EventBusPublisher.publish()
 * internal → ログ出力のみ
 */
export function resolveDispatchHandlerForMode(
  executionMode: string,
): DispatchHandler {
  switch (executionMode) {
    case "queue":
    case "email":
    case "webhook":
      return createQueueDispatchHandler();
    case "eventbus":
      return createEventBusDispatchHandler();
    case "internal":
    default:
      return createInternalDispatchHandler();
  }
}

function createQueueDispatchHandler(): DispatchHandler {
  return async (event: OutboxEventRecord) => {
    const { createQueuePublisher } = await import("@/infrastructure");
    const queue = createQueuePublisher();
    const result = await queue.publish({
      eventType: event.eventType,
      executionMode: "queue",
      payloadJson: event.payloadJson,
      requestId: "",
      tenantId: null,
      executionContext: "system",
    });

    if (!result.ok) {
      throw new Error(`Queue publish failed: ${result.errorMessage}`);
    }

    logger.info("Outbox event dispatched via queue", {
      outboxEventId: event.id,
      outboxEventType: event.eventType,
      dryRun: result.dryRun ?? false,
    });
  };
}

function createEventBusDispatchHandler(): DispatchHandler {
  return async (event: OutboxEventRecord) => {
    const { createEventBusPublisher } = await import("@/infrastructure");
    const bus = createEventBusPublisher();
    const result = await bus.publish({
      source: "oa-saas.outbox",
      detailType: event.eventType,
      detail: { payloadJson: event.payloadJson },
      requestId: "",
      tenantId: null,
      executionContext: "system",
    });

    if (!result.ok) {
      throw new Error(`EventBus publish failed: ${result.errorMessage}`);
    }

    logger.info("Outbox event dispatched via eventbus", {
      outboxEventId: event.id,
      outboxEventType: event.eventType,
    });
  };
}

function createInternalDispatchHandler(): DispatchHandler {
  return async (event: OutboxEventRecord) => {
    logger.info("Outbox event processed internally (no external dispatch)", {
      outboxEventId: event.id,
      outboxEventType: event.eventType,
    });
  };
}
