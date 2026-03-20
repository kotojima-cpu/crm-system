/**
 * Outbox エラー定義
 *
 * 既存の AppError 階層と整合する。
 */

import { AppError } from "@/shared/errors";
import type { OutboxStatus } from "./types";

/** Outbox 入力バリデーションエラー */
export class OutboxValidationError extends AppError {
  constructor(message: string) {
    super("OUTBOX_VALIDATION_ERROR", message, 400);
    this.name = "OutboxValidationError";
  }
}

/** Outbox ステータス遷移エラー */
export class OutboxStatusTransitionError extends AppError {
  constructor(from: OutboxStatus, to: OutboxStatus) {
    super(
      "OUTBOX_STATUS_TRANSITION_ERROR",
      `Invalid outbox status transition: ${from} → ${to}`,
      409,
    );
    this.name = "OutboxStatusTransitionError";
  }
}

/** Outbox ペイロード直列化エラー */
export class OutboxSerializationError extends AppError {
  constructor(message = "Failed to serialize outbox payload") {
    super("OUTBOX_SERIALIZATION_ERROR", message, 500);
    this.name = "OutboxSerializationError";
  }
}

/** Outbox ディスパッチエラー（外部呼び出し失敗） */
export class OutboxDispatchError extends AppError {
  constructor(
    message: string,
    public readonly eventType: string,
    public readonly lastError?: string,
  ) {
    super("OUTBOX_DISPATCH_ERROR", message, 502);
    this.name = "OutboxDispatchError";
  }
}
