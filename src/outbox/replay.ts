/**
 * Outbox Replay / Manual Retry
 *
 * dead / failed event を手動で再実行するための足場。
 * 将来の運用 UI や管理 API から呼び出す。
 *
 * ┌─ 再実行ルール ─────────────────────────────────────────────────────┐
 * │ failed → retryOutboxEventById  → 即時 retry 実行                  │
 * │ dead   → replayDeadOutboxEventById → pending に戻す               │
 * │ sent   → 原則禁止（forceSentReplay=true で強制 replay 可）         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { prisma } from "@/shared/db";
import { logger } from "@/shared/logging";
import { ValidationError, NotFoundError } from "@/shared/errors";
import type { OutboxEventRecord } from "./dispatcher";
import type { OutboxStatus } from "./types";

/**
 * outbox event を ID で取得する（replay 内部用）。
 */
async function fetchEventOrThrow(id: number): Promise<OutboxEventRecord> {
  const record = await prisma.outboxEvent.findUnique({ where: { id } });
  if (!record) {
    throw new NotFoundError(`OutboxEvent not found: id=${id}`);
  }
  return { ...record, status: record.status as OutboxStatus };
}

/**
 * outbox event を pending に強制リセットする（内部ヘルパー）。
 *
 * retryCount はリセットしない（経緯を残す）。
 * availableAt を now にリセットして即時 poll 対象にする。
 */
export async function resetOutboxEventToPending(
  id: number,
): Promise<OutboxEventRecord> {
  const now = new Date();
  const updated = await prisma.outboxEvent.update({
    where: { id },
    data: {
      status: "pending",
      availableAt: now,
      lastError: null,
      updatedAt: now,
    },
  });

  logger.info("Outbox event reset to pending", {
    outboxEventId: id,
    outboxEventType: updated.eventType,
    outboxRetryCount: updated.retryCount,
  });

  return { ...updated, status: "pending" };
}

/**
 * failed event を即時 retry 実行する。
 *
 * worker handler map を渡すと、同プロセス内で処理する。
 * 省略時は pending にリセットして次回 poll に委ねる。
 */
export async function retryOutboxEventById(
  eventId: number,
  handlerMap?: import("@/worker/types").WorkerHandlerMap,
): Promise<OutboxEventRecord> {
  const record = await fetchEventOrThrow(eventId);

  if (record.status !== "failed") {
    throw new ValidationError(
      `Cannot retry event with status "${record.status}". Only "failed" events can be retried.`,
    );
  }

  if (handlerMap) {
    // 即時実行
    const { consumeOutboxEventRecord } = await import("@/worker/consumer");
    await consumeOutboxEventRecord(record, handlerMap);
    const updated = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    return { ...updated!, status: updated!.status as OutboxStatus };
  } else {
    // 次回 poll に委ねる
    return resetOutboxEventToPending(eventId);
  }
}

/**
 * dead event を pending に戻して再実行対象にする。
 *
 * retryCount はリセットしない（maxRetries を超える場合は再度 dead になる）。
 * retryCount を 0 にリセットしたい場合は resetRetryCount=true を指定する。
 */
export async function replayDeadOutboxEventById(
  eventId: number,
  options: { resetRetryCount?: boolean } = {},
): Promise<OutboxEventRecord> {
  const record = await fetchEventOrThrow(eventId);

  if (record.status !== "dead") {
    throw new ValidationError(
      `Cannot replay event with status "${record.status}". Only "dead" events can be replayed.`,
    );
  }

  const now = new Date();
  const updated = await prisma.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: "pending",
      availableAt: now,
      lastError: null,
      retryCount: options.resetRetryCount ? 0 : record.retryCount,
      updatedAt: now,
    },
  });

  logger.info("Dead outbox event replayed (reset to pending)", {
    outboxEventId: eventId,
    outboxEventType: updated.eventType,
    outboxRetryCount: updated.retryCount,
    resetRetryCount: options.resetRetryCount ?? false,
  });

  return { ...updated, status: "pending" };
}

/**
 * sent event を強制 replay する（原則禁止）。
 *
 * 冪等でない handler を持つ event で使うと二重送信が発生する。
 * forceSentReplay=true を明示しないと実行できない。
 */
export async function forceReplaySentOutboxEvent(
  eventId: number,
  options: { forceSentReplay: true },
): Promise<OutboxEventRecord> {
  if (!options.forceSentReplay) {
    throw new ValidationError("Replaying a sent event requires forceSentReplay=true.");
  }

  const record = await fetchEventOrThrow(eventId);

  if (record.status !== "sent") {
    throw new ValidationError(
      `Event ${eventId} has status "${record.status}", not "sent".`,
    );
  }

  logger.warn("Forced replay of sent outbox event (potential duplicate send risk)", {
    outboxEventId: eventId,
    outboxEventType: record.eventType,
  });

  return resetOutboxEventToPending(eventId);
}
