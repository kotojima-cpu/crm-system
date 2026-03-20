import type { HealthCheckStatus } from "@/features/platform-health-history";

export interface PlatformHistoryDashboardSummary {
  alertHistoryCount: number;
  healthHistoryCount: number;
  webhookAlertCount: number;
  mailAlertCount: number;
  suppressedHealthCheckCount: number;
  latestHealthStatus: HealthCheckStatus | "unknown";
  latestHealthCheckAt: Date | null;
}
