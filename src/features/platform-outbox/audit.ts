/**
 * platform-outbox 監査ログ helper
 *
 * retry / replay / force-replay / poll 操作を AuditLog に記録する。
 * withPlatformTx を使って AuditLog を記録するため、
 * メインの outbox 更新とは別トランザクションで書き込まれる。
 */

import { withPlatformTx } from "@/shared/db";
import { writeAuditLog } from "@/audit/writer";
import {
  AUDIT_OUTBOX_RETRIED,
  AUDIT_OUTBOX_REPLAYED,
  AUDIT_OUTBOX_FORCE_REPLAYED,
  AUDIT_OUTBOX_POLL_TRIGGERED,
} from "@/audit/actions";

/**
 * outbox retry 操作を AuditLog に記録する。
 */
export async function auditOutboxRetried(
  eventId: number,
  meta: { eventType: string; prevStatus: string },
): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_RETRIED,
      recordId: eventId,
      result: "success",
      message: `OutboxEvent ${eventId} retried`,
      newValues: {
        eventType: meta.eventType,
        prevStatus: meta.prevStatus,
        newStatus: "pending",
      },
    });
  });
}

/**
 * dead event replay を AuditLog に記録する。
 */
export async function auditOutboxReplayed(
  eventId: number,
  meta: { eventType: string; resetRetryCount: boolean },
): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_REPLAYED,
      recordId: eventId,
      result: "success",
      message: `Dead OutboxEvent ${eventId} replayed`,
      newValues: {
        eventType: meta.eventType,
        prevStatus: "dead",
        newStatus: "pending",
        resetRetryCount: meta.resetRetryCount,
      },
    });
  });
}

/**
 * sent event の force replay を AuditLog に記録する（危険操作）。
 */
export async function auditOutboxForceReplayed(
  eventId: number,
  meta: { eventType: string; reason?: string },
): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_FORCE_REPLAYED,
      recordId: eventId,
      result: "success",
      message: `[DANGEROUS] Sent OutboxEvent ${eventId} force replayed`,
      newValues: {
        eventType: meta.eventType,
        prevStatus: "sent",
        newStatus: "pending",
        forceReplay: true,
        reason: meta.reason ?? null,
      },
    });
  });
}

/**
 * poll サイクルトリガーを AuditLog に記録する。
 */
export async function auditOutboxPollTriggered(meta: {
  processedCount: number;
  sentCount: number;
  failedCount: number;
}): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_POLL_TRIGGERED,
      result: "success",
      message: "Outbox poll cycle triggered manually",
      newValues: meta,
    });
  });
}
