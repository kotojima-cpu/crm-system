import { validateRecoverStuckEventsInput } from "./validators";
import {
  findRecoverableStuckOutboxEvents,
  markStuckEventRecovered,
  countRecoverableStuckOutboxEvents,
} from "./repository";
import { auditOutboxStuckRecoveryBatch } from "./audit";
import type { RecoverStuckEventsInput, RecoverStuckEventsResult, RecoverableOutboxEventView } from "./types";

export { countRecoverableStuckOutboxEvents };

/**
 * stuck processing event を一括 recovery する。
 *
 * dryRun=true の場合は DB 更新なし、対象 ID 一覧のみ返す。
 * recovery: processing → failed（retryCount 増やさない）
 */
export async function recoverStuckOutboxEvents(
  input: RecoverStuckEventsInput = {},
): Promise<RecoverStuckEventsResult> {
  const { thresholdMinutes, limit, dryRun } = validateRecoverStuckEventsInput(input);

  const candidates = await findRecoverableStuckOutboxEvents({ thresholdMinutes, limit });

  if (dryRun) {
    return {
      scannedCount: candidates.length,
      recoveredCount: 0,
      skippedCount: candidates.length,
      dryRun: true,
      recoveredIds: candidates.map((c) => c.id),
      skippedIds: [],
    };
  }

  const recoveredIds: number[] = [];
  const skippedIds: number[] = [];

  for (const event of candidates) {
    try {
      await markStuckEventRecovered(
        event.id,
        `threshold=${thresholdMinutes}min exceeded`,
      );
      recoveredIds.push(event.id);
    } catch {
      skippedIds.push(event.id);
    }
  }

  // AuditLog（best-effort）
  if (recoveredIds.length > 0) {
    await auditOutboxStuckRecoveryBatch({
      recoveredCount: recoveredIds.length,
      thresholdMinutes,
      recoveredIds,
    }).catch(() => {});
  }

  return {
    scannedCount: candidates.length,
    recoveredCount: recoveredIds.length,
    skippedCount: skippedIds.length,
    dryRun: false,
    recoveredIds,
    skippedIds,
  };
}

/**
 * recovery 対象一覧を返す（read-only）。
 */
export async function listRecoverableStuckEvents(
  thresholdMinutes = 15,
  limit = 100,
): Promise<RecoverableOutboxEventView[]> {
  return findRecoverableStuckOutboxEvents({ thresholdMinutes, limit });
}
