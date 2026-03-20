/**
 * Outbox Writer
 *
 * 設計書: tenant-auth-design.md §11, security-design.md §7
 *
 * transaction 内で outbox event を DB に永続化する。
 * DB 更新・AuditLog 記録と同一 transaction で作成し、
 * commit 後に poller / dispatcher / worker が処理する。
 *
 * ┌─ 利用ルール ─────────────────────────────────────────────────────────┐
 * │ 1. writeOutboxEvent は必ず transaction 内で呼ぶこと                  │
 * │ 2. transaction 内で外部副作用（email/webhook/queue）を直接呼ばない  │
 * │ 3. outbox event 書き込み失敗は transaction 全体失敗として扱う       │
 * │ 4. AuditLog と outbox event は同一 transaction で並行記録可能       │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import type { TxClient } from "@/shared/db";
import { logger } from "@/shared/logging";
import type { WriteOutboxEventInput, ResolvedOutboxEventInput } from "./types";
import { resolveOutboxEventInput } from "./serializer";

/**
 * WriteOutboxEventInput → ResolvedOutboxEventInput に変換する。
 *
 * serializer.resolveOutboxEventInput のエイリアス。
 * テスト等で envelope の内容を検証したい場合に使う。
 */
export function buildOutboxEventInput(
  input: WriteOutboxEventInput,
): ResolvedOutboxEventInput {
  return resolveOutboxEventInput(input);
}

/**
 * transaction 内で outbox event を DB に永続化する。
 *
 * status = "pending" で作成し、poller が availableAt 以降に取得する。
 */
export async function writeOutboxEvent(
  tx: TxClient,
  input: WriteOutboxEventInput,
): Promise<ResolvedOutboxEventInput> {
  const resolved = resolveOutboxEventInput(input);

  await tx.outboxEvent.create({
    data: {
      eventType: resolved.eventType,
      executionMode: resolved.executionMode,
      status: resolved.status,
      payloadJson: resolved.payloadJson,
      availableAt: resolved.availableAt,
      retryCount: 0,
      maxRetries: resolved.maxRetries,
      lastError: null,
      processedAt: null,
    },
  });

  logger.info("OutboxEvent created", {
    outboxEventType: resolved.eventType,
    outboxExecutionMode: resolved.executionMode,
    outboxStatus: resolved.status,
    outboxJobType: resolved.payloadEnvelope.jobType,
    outboxResourceId: resolved.payloadEnvelope.resourceId,
    outboxRequestId: resolved.payloadEnvelope.requestId as string,
    outboxTenantId: resolved.payloadEnvelope.tenantId as number | null,
    outboxActorUserId: resolved.payloadEnvelope.actorUserId as number | null,
    outboxExecutionContext: resolved.payloadEnvelope.executionContext,
    outboxAvailableAt: resolved.availableAt.toISOString(),
  });

  return resolved;
}
