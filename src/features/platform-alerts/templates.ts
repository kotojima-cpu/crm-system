import type { OutboxSummary, OutboxOperationalAlert } from "./types";

export function buildOutboxAlertWebhookPayload(
  summary: OutboxSummary,
  alerts: OutboxOperationalAlert[],
): Record<string, unknown> {
  return {
    event: "outbox.operational_alert",
    alerts: alerts.map((a) => ({
      level: a.level,
      code: a.code,
      count: a.count,
    })),
    summary: {
      pendingCount: summary.pendingCount,
      processingCount: summary.processingCount,
      failedCount: summary.failedCount,
      deadCount: summary.deadCount,
      stuckProcessingCount: summary.stuckProcessingCount,
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildOutboxAlertMailSubject(
  environment: string,
  alerts: OutboxOperationalAlert[],
): string {
  const codes = alerts.map((a) => a.code).join(", ");
  return `[${environment.toUpperCase()}] Outbox アラート: ${codes}`;
}

export function buildOutboxAlertMailBody(
  summary: OutboxSummary,
  alerts: OutboxOperationalAlert[],
): string {
  const lines: string[] = [
    "Outbox 運用アラートが発生しました。",
    "",
    "=== アラート ===",
    ...alerts.map((a) => {
      if (a.code === "DEAD_EVENTS_EXIST")
        return `・Dead イベントが ${a.count} 件存在します`;
      if (a.code === "STUCK_PROCESSING")
        return `・Stuck processing が ${a.count} 件あります`;
      if (a.code === "FAILED_EVENTS_HIGH")
        return `・Failed イベントが ${a.count} 件あります`;
      return `・${(a as { code: string; count: number }).code}: ${(a as { code: string; count: number }).count} 件`;
    }),
    "",
    "=== サマリー ===",
    `pending: ${summary.pendingCount}`,
    `processing: ${summary.processingCount}`,
    `failed: ${summary.failedCount}`,
    `dead: ${summary.deadCount}`,
    `stuck: ${summary.stuckProcessingCount}`,
    "",
    "対応が必要な場合は /platform/outbox を確認してください。",
  ];
  return lines.join("\n");
}
