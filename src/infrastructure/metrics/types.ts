/**
 * MetricsPublisher 型定義
 */

/** メトリクス名 */
export type MetricName =
  | "OutboxEventsPending"
  | "OutboxEventsFailed"
  | "OutboxEventsDead"
  | "OutboxEventsProcessing"
  | "OutboxEventsSent"
  | "OutboxPollDuration"
  | "OutboxPollProcessedCount"
  | "OutboxStuckProcessingCount";

/** メトリクス単位 */
export type MetricUnit =
  | "Count"
  | "Milliseconds"
  | "Seconds"
  | "Bytes"
  | "None";

/** 1 件のメトリクスデータポイント */
export interface MetricDataPoint {
  name: MetricName;
  value: number;
  unit: MetricUnit;
  /** 追加ディメンション（省略可） */
  dimensions?: Record<string, string>;
  timestamp?: Date;
}
