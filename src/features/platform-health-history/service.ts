import { prisma } from "@/shared/db";
import { logger } from "@/shared/logging";
import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";
import type { HealthCheckStatus, PlatformHealthCheckHistoryRecord } from "./types";

/**
 * アラートから health check status を判定する。
 * dead または stuck → critical
 * failed 多数 → warning
 * なし → healthy
 */
export function determineHealthCheckStatus(
  alerts: OutboxOperationalAlert[],
): HealthCheckStatus {
  const hasCritical = alerts.some(
    (a) => a.code === "DEAD_EVENTS_EXIST" || a.code === "STUCK_PROCESSING",
  );
  if (hasCritical) return "critical";
  if (alerts.length > 0) return "warning";
  return "healthy";
}

/**
 * アラートコード文字列配列から health check status を判定する。
 * alert-status API など、alertCodesJson を持つ場面で使用する。
 */
export function determineHealthCheckStatusFromCodes(
  alertCodes: string[],
): HealthCheckStatus {
  const hasCritical = alertCodes.some(
    (c) => c === "DEAD_EVENTS_EXIST" || c === "STUCK_PROCESSING",
  );
  if (hasCritical) return "critical";
  if (alertCodes.length > 0) return "warning";
  return "healthy";
}

/**
 * Health check 実行結果を保存する（best-effort）。
 */
export async function saveHealthCheckHistory(input: {
  summary: OutboxSummary;
  alerts: OutboxOperationalAlert[];
  metricsPublished: boolean;
  notificationsSent: boolean;
  suppressedByCooldown: boolean;
}): Promise<PlatformHealthCheckHistoryRecord | null> {
  try {
    const record = await prisma.platformHealthCheckHistory.create({
      data: {
        summaryJson: JSON.stringify(input.summary),
        alertCodesJson: JSON.stringify(input.alerts.map((a) => a.code)),
        metricsPublished: input.metricsPublished,
        notificationsSent: input.notificationsSent,
        suppressedByCooldown: input.suppressedByCooldown,
      },
    });
    return {
      id: record.id,
      summaryJson: record.summaryJson,
      alertCodesJson: record.alertCodesJson,
      metricsPublished: record.metricsPublished,
      notificationsSent: record.notificationsSent,
      suppressedByCooldown: record.suppressedByCooldown,
      createdAt: record.createdAt,
    };
  } catch (err) {
    logger.warn("[saveHealthCheckHistory] failed", { err });
    return null;
  }
}

/**
 * Health check 履歴を取得する。
 */
export async function listHealthCheckHistory(
  limit = 20,
): Promise<PlatformHealthCheckHistoryRecord[]> {
  const records = await prisma.platformHealthCheckHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  return records.map((r) => ({
    id: r.id,
    summaryJson: r.summaryJson,
    alertCodesJson: r.alertCodesJson,
    metricsPublished: r.metricsPublished,
    notificationsSent: r.notificationsSent,
    suppressedByCooldown: r.suppressedByCooldown,
    createdAt: r.createdAt,
  }));
}

/**
 * 最新の Health check 履歴を取得する。
 */
export async function getLatestHealthCheckHistory(): Promise<PlatformHealthCheckHistoryRecord | null> {
  const record = await prisma.platformHealthCheckHistory.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  return {
    id: record.id,
    summaryJson: record.summaryJson,
    alertCodesJson: record.alertCodesJson,
    metricsPublished: record.metricsPublished,
    notificationsSent: record.notificationsSent,
    suppressedByCooldown: record.suppressedByCooldown,
    createdAt: record.createdAt,
  };
}
