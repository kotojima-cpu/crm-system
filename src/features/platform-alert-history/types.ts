export type AlertChannel = "webhook" | "mail";

export interface PlatformAlertHistoryRecord {
  id: number;
  alertKey: string;
  channel: AlertChannel;
  lastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
