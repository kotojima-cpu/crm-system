import type { PlatformHealthCheckHistoryRecord } from "./types";
import type { OutboxSummary } from "@/features/platform-outbox/types";

export function parseHealthHistorySummary(record: PlatformHealthCheckHistoryRecord): OutboxSummary | null {
  try {
    return JSON.parse(record.summaryJson) as OutboxSummary;
  } catch {
    return null;
  }
}

export function parseHealthHistoryAlertCodes(record: PlatformHealthCheckHistoryRecord): string[] {
  try {
    const parsed = JSON.parse(record.alertCodesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
