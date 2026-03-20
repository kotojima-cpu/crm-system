/**
 * Worker Retry Policy
 *
 * リトライ判定・dead 判定・次回リトライ時刻計算を提供する。
 *
 * ルール:
 * - payload 不正 / tenant 不一致はリトライ不可（即 dead）
 * - handler 実行エラーで retryable=true の場合のみリトライ
 * - maxRetries 到達で dead
 * - リトライ間隔は exponential backoff（base 30秒、最大 1時間）
 */

import type { ParsedWorkerJob, WorkerProcessResult } from "./types";
import {
  WorkerPayloadValidationError,
  WorkerTenantContextError,
  WorkerOwnershipMismatchError,
  WorkerHandlerNotFoundError,
} from "./errors";

/** リトライ間隔の基本秒数（30秒） */
const RETRY_BASE_SECONDS = 30;

/** リトライ間隔の最大秒数（1時間） */
const RETRY_MAX_SECONDS = 3600;

/**
 * ジョブをリトライすべきか判定する。
 *
 * リトライ不可の条件:
 * - retryCount >= maxRetries
 * - WorkerProcessResult.status === "dead"
 * - WorkerProcessResult.status === "failed" かつ retryable === false
 * - エラーが構造的（payload 不正、handler 未登録、tenant 不一致）
 */
export function shouldRetryWorkerJob(
  job: ParsedWorkerJob,
  result: WorkerProcessResult,
): boolean {
  if (result.status === "sent") return false;
  if (result.status === "dead") return false;

  if (result.status === "failed") {
    if (!result.retryable) return false;
    if (job.retryCount + 1 >= job.maxRetries) return false;
    return true;
  }

  return false;
}

/**
 * ジョブを dead に移行すべきか判定する。
 *
 * dead に移行する条件:
 * - maxRetries 到達
 * - 構造的エラー（リトライしても無意味）
 * - result.status === "dead"
 */
export function shouldMoveWorkerJobToDead(
  job: ParsedWorkerJob,
  result: WorkerProcessResult,
): boolean {
  if (result.status === "dead") return true;

  if (result.status === "failed") {
    if (!result.retryable) return true;
    if (job.retryCount + 1 >= job.maxRetries) return true;
  }

  return false;
}

/**
 * エラーからリトライ不可か判定する。
 *
 * 構造的エラー（payload 不正、handler 未登録、tenant 不一致）は
 * リトライしても同じ結果になるため、リトライ不可とする。
 */
export function isNonRetryableError(error: unknown): boolean {
  return (
    error instanceof WorkerPayloadValidationError ||
    error instanceof WorkerTenantContextError ||
    error instanceof WorkerOwnershipMismatchError ||
    error instanceof WorkerHandlerNotFoundError
  );
}

/**
 * 次回リトライ時刻を計算する。
 *
 * exponential backoff: base * 2^retryCount
 * 上限: RETRY_MAX_SECONDS
 *
 * @param retryCount 現在のリトライ回数（0-indexed）
 * @param now 基準時刻（テスト用にオーバーライド可能）
 */
export function calculateNextRetryAt(
  retryCount: number,
  now: Date = new Date(),
): Date {
  const delaySeconds = Math.min(
    RETRY_BASE_SECONDS * Math.pow(2, retryCount),
    RETRY_MAX_SECONDS,
  );

  return new Date(now.getTime() + delaySeconds * 1000);
}
