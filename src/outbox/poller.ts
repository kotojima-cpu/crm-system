/**
 * Outbox Poller
 *
 * DB から pending / failed (availableAt<=now) の outbox event を取得し、
 * consumer 経由で処理する。
 *
 * 処理フロー:
 * 1. pending + availableAt<=now のレコードを取得（limit 件）
 * 2. 各レコードを consumeOutboxEventRecord() で処理
 * 3. sent / failed / dead の件数をサマリーとして返す
 *
 * ┌─ 多重実行防止 ─────────────────────────────────────────────────────┐
 * │ 現行実装: 1件ずつ markOutboxProcessing して取得。                  │
 * │ 競合が起きた場合は後発が status mismatch で skip する設計。        │
 * │ 本格対応は SELECT FOR UPDATE SKIP LOCKED または楽観的ロックを使う。│
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { prisma } from "@/shared/db";
import { logger } from "@/shared/logging";
import type { PollOutboxEventsInput, OutboxPollerSummary, OutboxStatus } from "./types";
import type { OutboxEventRecord } from "./dispatcher";
import { OutboxStatusTransitionError } from "./errors";

const DEFAULT_POLL_LIMIT = 50;

/**
 * DB から処理対象 outbox event を取得する。
 *
 * 対象条件:
 * - status IN ('pending', 'failed')
 * - availableAt <= now
 * - createdAt asc（古いものから処理）
 */
export async function pollPendingOutboxEvents(
  input: PollOutboxEventsInput = {},
): Promise<OutboxEventRecord[]> {
  const limit = input.limit ?? DEFAULT_POLL_LIMIT;
  const now = new Date();

  const records = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      availableAt: { lte: now },
      ...(input.executionMode ? { executionMode: input.executionMode } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return records.map((r) => ({
    ...r,
    status: r.status as OutboxStatus,
  }));
}

/**
 * 単一の outbox event を処理する。
 *
 * consumer を動的に import して循環依存を避ける。
 * 結果を返し、エラーは握り潰さず caller へ伝える。
 */
export async function processPolledOutboxEvent(
  record: OutboxEventRecord,
  handlerMap: import("@/worker/types").WorkerHandlerMap,
): Promise<"sent" | "failed" | "dead" | "skipped"> {
  const { consumeOutboxEventRecord } = await import("@/worker/consumer");

  try {
    const result = await consumeOutboxEventRecord(record, handlerMap);
    return result.status === "sent" ? "sent"
      : result.status === "dead" ? "dead"
      : "failed";
  } catch (err) {
    if (err instanceof OutboxStatusTransitionError) {
      // 既に processing 等で取られている場合はスキップ
      logger.warn("Outbox event skipped (status transition conflict)", {
        outboxEventId: record.id,
        outboxEventType: record.eventType,
        outboxCurrentStatus: record.status,
      });
      return "skipped";
    }
    throw err;
  }
}

/**
 * outbox poll サイクルを実行する。
 *
 * @param handlerMap worker handler map
 * @param input poll 条件（件数上限など）
 */
export async function runOutboxPollCycle(
  handlerMap: import("@/worker/types").WorkerHandlerMap,
  input: PollOutboxEventsInput = {},
): Promise<OutboxPollerSummary> {
  const summary: OutboxPollerSummary = {
    polledCount: 0,
    sentCount: 0,
    failedCount: 0,
    deadCount: 0,
    skippedCount: 0,
    errors: [],
  };

  const records = await pollPendingOutboxEvents(input);
  summary.polledCount = records.length;

  logger.info("Outbox poll cycle started", {
    outboxPolledCount: records.length,
    outboxLimit: input.limit ?? DEFAULT_POLL_LIMIT,
  });

  for (const record of records) {
    try {
      const outcome = await processPolledOutboxEvent(record, handlerMap);
      switch (outcome) {
        case "sent":     summary.sentCount++;    break;
        case "failed":   summary.failedCount++;  break;
        case "dead":     summary.deadCount++;    break;
        case "skipped":  summary.skippedCount++; break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.failedCount++;
      summary.errors.push(`[${record.id}:${record.eventType}] ${msg}`);

      logger.error("Outbox poll: unexpected error processing event", err instanceof Error ? err : undefined, {
        outboxEventId: record.id,
        outboxEventType: record.eventType,
      });
    }
  }

  logger.info("Outbox poll cycle completed", {
    outboxPolledCount: summary.polledCount,
    outboxSentCount: summary.sentCount,
    outboxFailedCount: summary.failedCount,
    outboxDeadCount: summary.deadCount,
    outboxSkippedCount: summary.skippedCount,
    outboxErrorCount: summary.errors.length,
  });

  return summary;
}
