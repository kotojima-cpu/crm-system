import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";

export type { OutboxSummary, OutboxOperationalAlert };

export interface OutboxAlertNotificationInput {
  summary: OutboxSummary;
  alerts: OutboxOperationalAlert[];
  triggeredAt: Date;
  environment: string;
}

export interface OutboxAlertNotificationResult {
  notifiedByWebhook: boolean;
  notifiedByMail: boolean;
  skipped: boolean;
  reasons: string[];
  suppressedByCooldown: boolean;
  suppressedChannels: string[];
}
