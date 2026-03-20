/**
 * platform-outbox-recovery 監査ログ helper
 */

import { withPlatformTx } from "@/shared/db";
import { writeAuditLog } from "@/audit/writer";
import { AUDIT_OUTBOX_STUCK_RECOVERED } from "@/audit/actions";

export async function auditOutboxStuckRecovered(
  eventId: number,
  meta: { eventType: string; thresholdMinutes: number },
): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_STUCK_RECOVERED,
      recordId: eventId,
      result: "success",
      message: `Stuck processing OutboxEvent ${eventId} recovered to failed`,
      newValues: {
        eventType: meta.eventType,
        prevStatus: "processing",
        newStatus: "failed",
        thresholdMinutes: meta.thresholdMinutes,
      },
    });
  });
}

export async function auditOutboxStuckRecoveryBatch(meta: {
  recoveredCount: number;
  thresholdMinutes: number;
  recoveredIds: number[];
}): Promise<void> {
  await withPlatformTx(async (tx) => {
    await writeAuditLog(tx, {
      ...AUDIT_OUTBOX_STUCK_RECOVERED,
      result: "success",
      message: `Batch stuck recovery: ${meta.recoveredCount} events recovered`,
      newValues: {
        recoveredCount: meta.recoveredCount,
        thresholdMinutes: meta.thresholdMinutes,
        recoveredIds: meta.recoveredIds,
      },
    });
  });
}
