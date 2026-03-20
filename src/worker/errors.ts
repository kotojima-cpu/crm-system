/**
 * Worker エラー定義
 *
 * 既存の AppError 階層と整合する。
 */

import { AppError } from "@/shared/errors";

/** Worker payload のバリデーションエラー（リトライ不可） */
export class WorkerPayloadValidationError extends AppError {
  constructor(message: string) {
    super("WORKER_PAYLOAD_VALIDATION_ERROR", message, 400);
    this.name = "WorkerPayloadValidationError";
  }
}

/** Worker tenant 文脈エラー（リトライ不可） */
export class WorkerTenantContextError extends AppError {
  constructor(message: string) {
    super("WORKER_TENANT_CONTEXT_ERROR", message, 400);
    this.name = "WorkerTenantContextError";
  }
}

/** Worker tenant 所有権不一致エラー（リトライ不可） */
export class WorkerOwnershipMismatchError extends AppError {
  constructor(
    public readonly payloadTenantId: number | null,
    public readonly dbTenantId: number | null,
    public readonly eventType: string,
    public readonly resourceId: string | number | null,
  ) {
    super(
      "WORKER_OWNERSHIP_MISMATCH",
      `Tenant ownership mismatch for ${eventType} (resource=${resourceId}): payload=${payloadTenantId}, db=${dbTenantId}`,
      403,
    );
    this.name = "WorkerOwnershipMismatchError";
  }
}

/** Worker handler 未登録エラー（リトライ不可） */
export class WorkerHandlerNotFoundError extends AppError {
  constructor(eventType: string) {
    super(
      "WORKER_HANDLER_NOT_FOUND",
      `No handler registered for event type: ${eventType}`,
      501,
    );
    this.name = "WorkerHandlerNotFoundError";
  }
}

/** Worker handler 実行エラー（リトライ可能性あり） */
export class WorkerExecutionError extends AppError {
  constructor(
    message: string,
    public readonly retryable: boolean = true,
  ) {
    super("WORKER_EXECUTION_ERROR", message, 500);
    this.name = "WorkerExecutionError";
  }
}
