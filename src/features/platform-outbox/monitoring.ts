/**
 * Outbox Monitoring — メトリクス発行
 *
 * poll 実行後に OutboxSummary を CloudWatch Metrics へ送信する。
 * メトリクス送信は best-effort — 失敗しても例外を上位に伝えない。
 */

import { createMetricsPublisher } from "@/infrastructure/factory";
import type { OutboxSummary } from "./types";
import type { MetricDataPoint } from "@/infrastructure/metrics";

/**
 * OutboxSummary を基にメトリクスを発行する。
 *
 * 呼び出し元は await しなくてよい（best-effort）。
 * ただし内部エラーは catch してログのみ出力する。
 */
export async function publishOutboxMetrics(summary: OutboxSummary): Promise<void> {
  try {
    const publisher = createMetricsPublisher();

    const metrics: MetricDataPoint[] = [
      { name: "OutboxEventsPending",        value: summary.pendingCount,        unit: "Count" },
      { name: "OutboxEventsProcessing",     value: summary.processingCount,     unit: "Count" },
      { name: "OutboxEventsFailed",         value: summary.failedCount,         unit: "Count" },
      { name: "OutboxEventsDead",           value: summary.deadCount,           unit: "Count" },
      { name: "OutboxEventsSent",           value: summary.sentCount,           unit: "Count" },
      { name: "OutboxStuckProcessingCount", value: summary.stuckProcessingCount, unit: "Count" },
    ];

    await publisher.publishMany(metrics);
  } catch (err) {
    // best-effort: ログのみ、呼び出し元には影響させない
    console.error("[publishOutboxMetrics] failed to publish metrics:", err);
  }
}
