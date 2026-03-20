/**
 * Worker Processor
 *
 * worker のメイン制御フロー。
 *
 * 処理フロー:
 * 1. payload parse → ParsedWorkerJob
 * 2. envelope validation
 * 3. RequestContext 構築（requestId 伝搬）
 * 4. executionPlan 決定（tenant / platform / system）
 * 5. handler 取得
 * 6. 適切な Tx wrapper で handler 実行
 * 7. 結果に応じて sent / failed / dead をマーク
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ REQUIRED AFTER SCHEMA MIGRATION                                    │
 * │                                                                    │
 * │ outbox_events テーブル追加後、handleWorkerSuccess / Failure で     │
 * │ outbox dispatcher の mark* 関数を呼び出して DB 更新を行うこと。    │
 * │ 現行は構造化ログ出力のみの暫定実装。                               │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { logger } from "@/shared/logging";
import { withTenantTx, withPlatformTx, withSystemTx } from "@/shared/db";
import type { TxClient } from "@/shared/db";
import type {
  ParsedWorkerJob,
  WorkerProcessResult,
  WorkerHandlerMap,
} from "./types";
import { validateWorkerPayloadEnvelope } from "./validators";
import { runWorkerWithContext, resolveWorkerExecutionPlan } from "./context";
import { getWorkerHandler } from "./handlers";
import {
  shouldRetryWorkerJob,
  shouldMoveWorkerJobToDead,
  isNonRetryableError,
  calculateNextRetryAt,
} from "./retry";
import { WorkerExecutionError } from "./errors";

/**
 * worker ジョブを処理する（メインエントリポイント）。
 *
 * この関数はジョブ全体のライフサイクルを管理する:
 * - RequestContext の設定
 * - execution plan の決定
 * - handler の取得・実行
 * - 成功 / 失敗時の後処理
 */
export async function processWorkerJob(
  job: ParsedWorkerJob,
  handlerMap: WorkerHandlerMap,
): Promise<WorkerProcessResult> {
  const startTime = Date.now();

  logger.info("Worker job processing started", {
    workerEventType: job.eventType,
    workerSource: job.source,
    workerExecutionMode: job.executionMode,
    workerRetryCount: job.retryCount,
    workerRecordId: job.recordId,
    workerRequestId: job.payloadEnvelope.requestId as string,
  });

  try {
    // 1. envelope validation
    validateWorkerPayloadEnvelope(job.payloadEnvelope);

    // 2. handler 取得（未登録は WorkerHandlerNotFoundError）
    const handler = getWorkerHandler(handlerMap, job.eventType);

    // 3. RequestContext 設定 + executionPlan 決定 + handler 実行
    const result = await runWorkerWithContext(
      job.payloadEnvelope,
      async () => {
        return executeWorkerJobInTx(job, handler);
      },
    );

    // 4. 結果に応じて後処理
    if (result.status === "sent") {
      await handleWorkerSuccess(job, result);
    } else {
      await handleWorkerFailure(job, result);
    }

    const elapsed = Date.now() - startTime;
    logger.info("Worker job processing completed", {
      workerEventType: job.eventType,
      workerResult: result.status,
      workerElapsedMs: elapsed,
    });

    return result;
  } catch (error) {
    // 構造的エラー（parse/validation/handler 未登録）
    const errorMessage = error instanceof Error ? error.message : String(error);
    const nonRetryable = isNonRetryableError(error);

    const result: WorkerProcessResult = nonRetryable
      ? { status: "dead", errorMessage }
      : { status: "failed", errorMessage, retryable: true };

    await handleWorkerFailure(job, result);

    const elapsed = Date.now() - startTime;
    logger.error("Worker job processing failed", error instanceof Error ? error : undefined, {
      workerEventType: job.eventType,
      workerResult: result.status,
      workerElapsedMs: elapsed,
      workerError: errorMessage,
    });

    return result;
  }
}

/**
 * 適切な Tx wrapper でジョブを実行する。
 *
 * executionPlan に基づいて:
 * - tenant → withTenantTx(tenantId, ...)
 * - platform → withPlatformTx(...)
 * - system → withSystemTx(...)
 */
export async function executeWorkerJobInTx(
  job: ParsedWorkerJob,
  handler: (args: { tx: TxClient; job: ParsedWorkerJob }) => Promise<WorkerProcessResult>,
): Promise<WorkerProcessResult> {
  const plan = resolveWorkerExecutionPlan(job.payloadEnvelope);

  switch (plan.executionContext) {
    case "tenant":
      return withTenantTx(plan.tenantId, async (tx) => {
        return handler({ tx, job });
      });

    case "platform":
      return withPlatformTx(async (tx) => {
        return handler({ tx, job });
      });

    case "system":
      return withSystemTx(async (tx) => {
        return handler({ tx, job });
      });
  }
}

/**
 * ジョブ成功時の後処理。
 *
 * 暫定: ログ出力のみ。
 * スキーマ移行後: outbox dispatcher の markOutboxSent を呼ぶ。
 */
export async function handleWorkerSuccess(
  job: ParsedWorkerJob,
  _result: WorkerProcessResult,
): Promise<void> {
  logger.info("Worker job succeeded", {
    workerEventType: job.eventType,
    workerRecordId: job.recordId,
    workerRequestId: job.payloadEnvelope.requestId as string,
  });

  // スキーマ移行後:
  // if (job.recordId !== null) {
  //   const event = await getOutboxEventRecord(job.recordId);
  //   await markOutboxSent(event);
  // }
}

/**
 * ジョブ失敗時の後処理。
 *
 * shouldRetryWorkerJob / shouldMoveWorkerJobToDead の判定に基づいて
 * リトライまたは dead 化する。
 *
 * 暫定: ログ出力のみ。
 * スキーマ移行後: outbox dispatcher の markOutboxFailed / markOutboxDead を呼ぶ。
 */
export async function handleWorkerFailure(
  job: ParsedWorkerJob,
  result: WorkerProcessResult,
): Promise<void> {
  if (shouldMoveWorkerJobToDead(job, result)) {
    const errorMessage = "errorMessage" in result ? result.errorMessage : "unknown";
    logger.error("Worker job moved to dead", undefined, {
      workerEventType: job.eventType,
      workerRecordId: job.recordId,
      workerError: errorMessage,
      workerRetryCount: job.retryCount,
    });

    // スキーマ移行後:
    // if (job.recordId !== null) {
    //   const event = await getOutboxEventRecord(job.recordId);
    //   await markOutboxDead(event, errorMessage);
    // }
  } else if (shouldRetryWorkerJob(job, result)) {
    const nextRetryAt = calculateNextRetryAt(job.retryCount);
    const errorMessage = "errorMessage" in result ? result.errorMessage : "unknown";
    logger.warn("Worker job scheduled for retry", {
      workerEventType: job.eventType,
      workerRecordId: job.recordId,
      workerError: errorMessage,
      workerRetryCount: job.retryCount + 1,
      workerNextRetryAt: nextRetryAt.toISOString(),
    });

    // スキーマ移行後:
    // if (job.recordId !== null) {
    //   const event = await getOutboxEventRecord(job.recordId);
    //   await markOutboxFailed(event, errorMessage);
    //   await updateOutboxAvailableAt(event.id, nextRetryAt);
    // }
  }
}
