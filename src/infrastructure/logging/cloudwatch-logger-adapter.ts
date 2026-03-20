/**
 * CloudWatch Logger Adapter
 *
 * CloudWatch Logs への転送足場。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番では ECS / Lambda 経由で stdout → CloudWatch Logs に自動転送     │
 * │ されるため、SDK による直接転送は通常不要。                            │
 * │                                                                      │
 * │ カスタム log group / stream が必要な場合のみ:                         │
 * │   1. @aws-sdk/client-cloudwatch-logs インストール                     │
 * │   2. IAM に logs:CreateLogStream / logs:PutLogEvents 権限付与        │
 * │   3. 環境変数 CLOUDWATCH_LOG_GROUP_NAME 設定                          │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import type { LoggerAdapter } from "./interface";
import type { StructuredLogEntry } from "./types";

export class CloudWatchLoggerAdapter implements LoggerAdapter {
  write(entry: StructuredLogEntry): void {
    // ECS / Lambda 環境では stdout JSON → CloudWatch Logs に自動転送。
    // ここでは追加処理なし。
    // カスタム転送が必要な場合は SDK 呼び出しを追加する。
    void entry;
  }

  async flush(): Promise<void> {
    // バッファフラッシュ（将来必要になった場合に実装）
  }
}
