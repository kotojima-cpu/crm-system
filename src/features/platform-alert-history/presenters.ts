import type { PlatformAlertHistoryRecord } from "./types";

export function splitAlertKey(alertKey: string): string[] {
  if (!alertKey.trim()) return [];
  return alertKey.split("|").map((s) => s.trim()).filter(Boolean);
}

export function formatAlertHistoryLabel(record: PlatformAlertHistoryRecord): string {
  const codes = splitAlertKey(record.alertKey);
  return `${record.channel}: ${codes.join(", ") || "(empty)"}`;
}
