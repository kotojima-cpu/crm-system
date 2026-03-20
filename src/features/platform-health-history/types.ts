export type HealthCheckStatus = "healthy" | "warning" | "critical";

export interface PlatformHealthCheckHistoryRecord {
  id: number;
  summaryJson: string;
  alertCodesJson: string;
  metricsPublished: boolean;
  notificationsSent: boolean;
  suppressedByCooldown: boolean;
  createdAt: Date;
}
