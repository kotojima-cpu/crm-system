/**
 * Local Metrics Publisher
 *
 * コンソールにメトリクスを出力する。
 * 追加の外部 sink は利用しない。
 *
 * 対象環境: local / test
 */

import type { MetricsPublisher } from "./interface";
import type { MetricDataPoint } from "./types";

export class LocalMetricsPublisher implements MetricsPublisher {
  /** テスト等から検証できるよう発行済みメトリクスを保持 */
  readonly published: MetricDataPoint[] = [];

  async publish(metric: MetricDataPoint): Promise<void> {
    this.published.push(metric);
    console.log(
      `[metrics] ${metric.name}=${metric.value} ${metric.unit}`,
      metric.dimensions ?? "",
    );
  }

  async publishMany(metrics: MetricDataPoint[]): Promise<void> {
    for (const m of metrics) {
      await this.publish(m);
    }
  }
}
