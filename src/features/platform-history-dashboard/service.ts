import { prisma } from "@/shared/db";
import { getLatestHealthCheckHistory, determineHealthCheckStatusFromCodes } from "@/features/platform-health-history";
import type { PlatformHistoryDashboardSummary } from "./types";

export async function getPlatformHistoryDashboardSummary(): Promise<PlatformHistoryDashboardSummary> {
  const [
    alertHistoryCount,
    healthHistoryCount,
    webhookAlertCount,
    mailAlertCount,
    suppressedHealthCheckCount,
    latest,
  ] = await Promise.all([
    prisma.platformAlertHistory.count(),
    prisma.platformHealthCheckHistory.count(),
    prisma.platformAlertHistory.count({ where: { channel: "webhook" } }),
    prisma.platformAlertHistory.count({ where: { channel: "mail" } }),
    prisma.platformHealthCheckHistory.count({ where: { suppressedByCooldown: true } }),
    getLatestHealthCheckHistory(),
  ]);

  const latestCodes =
    latest ? JSON.parse(latest.alertCodesJson) as string[] : [];

  return {
    alertHistoryCount,
    healthHistoryCount,
    webhookAlertCount,
    mailAlertCount,
    suppressedHealthCheckCount,
    latestHealthStatus: latest
      ? determineHealthCheckStatusFromCodes(latestCodes)
      : "unknown",
    latestHealthCheckAt: latest?.createdAt ?? null,
  };
}
