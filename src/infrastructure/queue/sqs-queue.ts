/**
 * SQS Queue Publisher
 *
 * Amazon SQS を使った queue publish 実装。
 * AWS SDK 呼び出しはこのファイルに閉じ込める。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番利用前に以下を完了すること:                                       │
 * │   1. SQS queue 作成（Standard or FIFO）                              │
 * │   2. 環境変数 AWS_SQS_QUEUE_URL 設定                                 │
 * │   3. AWS SDK v3 の @aws-sdk/client-sqs インストール                  │
 * │   4. IAM 実行ロールに sqs:SendMessage 権限付与                       │
 * │   5. FIFO 利用時は .fifo suffix + ContentBasedDeduplication 設定     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * MessageAttributes で以下を伝搬:
 *   requestId, eventType, tenantId, executionContext
 *
 * FIFO 対応:
 *   orderingKey → MessageGroupId
 *   deduplicationKey → MessageDeduplicationId
 */

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { logger } from "@/shared/logging";
import { getAwsRegion, getSqsQueueUrl } from "../config";
import type { QueuePublisher } from "./interface";
import type { QueuePublishInput, QueuePublishResult } from "./types";

export class SqsQueue implements QueuePublisher {
  async publish(input: QueuePublishInput): Promise<QueuePublishResult> {
    const queueUrl = getSqsQueueUrl();

    if (!queueUrl) {
      logger.error("[SqsQueue] AWS_SQS_QUEUE_URL is not configured", undefined, {
        queueEventType: input.eventType,
        queueRequestId: input.requestId,
      });
      return {
        ok: false,
        errorMessage: "SQS queue URL is not configured (AWS_SQS_QUEUE_URL)",
        retryable: false,
      };
    }

    const region = getAwsRegion();

    logger.info("[SqsQueue] Publishing to SQS", {
      queueEventType: input.eventType,
      queueRequestId: input.requestId,
      queueTenantId: input.tenantId,
      queueExecutionContext: input.executionContext,
      queueRegion: region,
      queueDeduplicationKey: input.deduplicationKey ?? null,
      queueOrderingKey: input.orderingKey ?? null,
    });

    try {
      const client = new SQSClient({ region });
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: input.payloadJson,
        MessageAttributes: {
          requestId: {
            DataType: "String",
            StringValue: input.requestId,
          },
          eventType: {
            DataType: "String",
            StringValue: input.eventType,
          },
          executionContext: {
            DataType: "String",
            StringValue: input.executionContext,
          },
          ...(input.tenantId !== null ? {
            tenantId: {
              DataType: "Number",
              StringValue: String(input.tenantId),
            },
          } : {}),
        },
        ...(input.deduplicationKey
          ? { MessageDeduplicationId: input.deduplicationKey }
          : {}),
        ...(input.orderingKey
          ? { MessageGroupId: input.orderingKey }
          : {}),
      });
      const result = await client.send(command);

      return {
        ok: true,
        providerMessageId: result.MessageId ?? null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const retryable = this.isRetryableError(err);

      logger.error("[SqsQueue] SQS publish failed", err instanceof Error ? err : undefined, {
        queueEventType: input.eventType,
        queueRequestId: input.requestId,
        queueTenantId: input.tenantId,
        queueRetryable: retryable,
      });

      return { ok: false, errorMessage, retryable };
    }
  }

  /**
   * SQS エラーがリトライ可能か判定する。
   *
   * - OverLimit / ServiceUnavailable / Throttling → retryable
   * - InvalidParameterValue / QueueDoesNotExist → non-retryable
   */
  private isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return true;
    const name = (err as { name?: string }).name ?? "";

    const nonRetryableErrors = [
      "InvalidParameterValue",
      "QueueDoesNotExist",
      "InvalidMessageContents",
    ];

    return !nonRetryableErrors.includes(name);
  }
}
