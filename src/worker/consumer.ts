/**
 * Worker Consumer
 *
 * outbox record / queue message を受け取り、
 * worker processor を実行して DB status を更新する薄い adapter。
 *
 * 処理フロー:
 * 1. record を markOutboxProcessing（pending/failed → processing）
 * 2. parseOutboxRecord → ParsedWorkerJob
 * 3. processWorkerJob → WorkerProcessResult
 * 4. 結果に応じて markOutboxSent / markOutboxFailed / markOutboxDead
 *
 * ┌─ 責務分離 ─────────────────────────────────────────────────────────┐
 * │ processor.ts: 実行ロジック（handler 呼び出し・Tx 管理）            │
 * │ consumer.ts:  DB status 更新（poller/queue と processor の橋渡し） │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { logger } from "@/shared/logging";
import {
  markOutboxProcessing,
  markOutboxSent,
  markOutboxFailed,
  markOutboxDead,
} from "@/outbox/dispatcher";
import type { OutboxEventRecord } from "@/outbox/dispatcher";
import { parseOutboxRecord, parseQueueMessage } from "./parser";
import { processWorkerJob } from "./processor";
import {
  shouldRetryWorkerJob,
  shouldMoveWorkerJobToDead,
} from "./retry";
import type { WorkerHandlerMap, WorkerProcessResult } from "./types";

/**
 * outbox record を消費する。
 *
 * 1. processing にマーク
 * 2. parse → processWorkerJob
 * 3. result で status 更新
 *
 * @returns WorkerProcessResult
 */
export async function consumeOutboxEventRecord(
  record: OutboxEventRecord,
  handlerMap: WorkerHandlerMap,
): Promise<WorkerProcessResult> {
  // 1. processing にマーク（競合した場合は StatusTransitionError で throw → caller が skip）
  await markOutboxProcessing(record);
  const processingRecord = { ...record, status: "processing" as const };

  let result: WorkerProcessResult;

  try {
    // 2. parse + process
    const job = parseOutboxRecord(record);
    result = await processWorkerJob(job, handlerMap);
  } catch (err) {
    // parse / context エラー → dead
    const errorMessage = err instanceof Error ? err.message : String(err);
    await markOutboxDead(processingRecord, errorMessage);

    logger.error("Consumer: parse/context error, event marked as dead", err instanceof Error ? err : undefined, {
      outboxEventId: record.id,
      outboxEventType: record.eventType,
    });

    return { status: "dead", errorMessage };
  }

  // 3. result に応じて DB 更新
  await updateStatusFromResult(processingRecord, result);
  return result;
}

/**
 * ID 指定で outbox event を消費する。
 */
export async function consumeOutboxEventById(
  eventId: number,
  handlerMap: WorkerHandlerMap,
): Promise<WorkerProcessResult> {
  const { loadOutboxEventById } = await import("@/outbox/dispatcher");
  const record = await loadOutboxEventById(eventId);
  if (!record) {
    return { status: "dead", errorMessage: `OutboxEvent not found: id=${eventId}` };
  }
  return consumeOutboxEventRecord(record, handlerMap);
}

/**
 * SQS 等のキューメッセージを消費する。
 *
 * キューメッセージは outbox record を持たないため、
 * DB status 更新は行わない。
 */
export async function consumeQueueMessage(
  messageBody: string,
  handlerMap: WorkerHandlerMap,
): Promise<WorkerProcessResult> {
  try {
    const job = parseQueueMessage(messageBody, { source: "queue" });
    const result = await processWorkerJob(job, handlerMap);

    logger.info("Consumer: queue message processed", {
      workerEventType: job.eventType,
      workerResult: result.status,
      workerRequestId: job.payloadEnvelope.requestId as string,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Consumer: queue message processing failed", err instanceof Error ? err : undefined, {
      messageBodyLength: messageBody.length,
    });
    return { status: "dead", errorMessage };
  }
}

/**
 * WorkerProcessResult に応じて outbox status を更新する。
 */
async function updateStatusFromResult(
  record: OutboxEventRecord,
  result: WorkerProcessResult,
): Promise<void> {
  if (result.status === "sent") {
    await markOutboxSent(record);
    return;
  }

  const errorMessage = "errorMessage" in result ? result.errorMessage : "unknown";

  // dummy job for retry policy check
  const jobForRetry = {
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    eventType: record.eventType,
    source: "outbox" as const,
    executionMode: record.executionMode as import("@/outbox/types").OutboxExecutionMode,
    payloadEnvelope: {} as never,
    rawPayloadJson: "",
    recordId: record.id,
  };

  if (shouldMoveWorkerJobToDead(jobForRetry, result)) {
    await markOutboxDead(record, errorMessage);
  } else if (shouldRetryWorkerJob(jobForRetry, result)) {
    await markOutboxFailed(record, errorMessage);
  } else {
    // retryable=false で maxRetries 未達 → dead
    await markOutboxDead(record, errorMessage);
  }
}
