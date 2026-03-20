import { ValidationError } from "@/shared/errors";
import { cleanupOldPlatformAlertHistory } from "@/features/platform-alert-history";
import { cleanupOldPlatformHealthHistory } from "@/features/platform-health-history";
import type { PlatformHistoryCleanupResult } from "./types";

export async function cleanupPlatformHistory(
  retentionDays = 30,
): Promise<PlatformHistoryCleanupResult> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new ValidationError("retentionDays must be between 1 and 365");
  }

  const [alertHistoryDeletedCount, healthHistoryDeletedCount] = await Promise.all([
    cleanupOldPlatformAlertHistory(retentionDays),
    cleanupOldPlatformHealthHistory(retentionDays),
  ]);

  return {
    alertHistoryDeletedCount,
    healthHistoryDeletedCount,
    retentionDays,
  };
}
