/**
 * MetricsPublisher Interface
 *
 * メトリクスを外部 sink（CloudWatch 等）に送信するインターフェース。
 * 業務コードはこの interface にのみ依存する。
 */

import type { MetricDataPoint } from "./types";

export interface MetricsPublisher {
  /**
   * 1 件のメトリクスを送信する。
   * 失敗しても例外を throw しない（best-effort）。
   */
  publish(metric: MetricDataPoint): Promise<void>;

  /**
   * 複数のメトリクスをまとめて送信する。
   * デフォルト実装は publish を順次呼ぶ。
   */
  publishMany(metrics: MetricDataPoint[]): Promise<void>;
}
