/**
 * CloudWatch Metrics Publisher
 *
 * AWS CloudWatch へカスタムメトリクスを送信する。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                        │
 * │ 1. @aws-sdk/client-cloudwatch インストール                             │
 * │    npm install @aws-sdk/client-cloudwatch                              │
 * │                                                                        │
 * │ 2. IAM ロール（Worker role / Platform job role）に権限付与             │
 * │    cloudwatch:PutMetricData                                            │
 * │                                                                        │
 * │ 3. 環境変数設定                                                        │
 * │    CLOUDWATCH_METRICS_NAMESPACE=OAManagement/Outbox (任意変更可)       │
 * │    AWS_REGION=ap-northeast-1 (既存設定を流用)                          │
 * │                                                                        │
 * │ 4. 本実装コードアンコメント & インポート復元                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 上記準備ができるまで本番でも LocalMetricsPublisher が使われる。
 * メトリクスは best-effort のため、送信失敗してもアプリに影響しない。
 */

import type { MetricsPublisher } from "./interface";
import type { MetricDataPoint } from "./types";

const NAMESPACE =
  process.env.CLOUDWATCH_METRICS_NAMESPACE ?? "OAManagement/Outbox";

export class CloudWatchMetricsPublisher implements MetricsPublisher {
  async publish(metric: MetricDataPoint): Promise<void> {
    // ┌─ TODO: REQUIRED BEFORE PRODUCTION ───────────────────────────────────┐
    // │                                                                       │
    // │ import {                                                              │
    // │   CloudWatchClient,                                                  │
    // │   PutMetricDataCommand,                                              │
    // │ } from "@aws-sdk/client-cloudwatch";                                 │
    // │                                                                       │
    // │ const client = new CloudWatchClient({ region: getAwsRegion() });     │
    // │ await client.send(new PutMetricDataCommand({                          │
    // │   Namespace: NAMESPACE,                                              │
    // │   MetricData: [{                                                      │
    // │     MetricName: metric.name,                                         │
    // │     Value: metric.value,                                             │
    // │     Unit: metric.unit,                                               │
    // │     Timestamp: metric.timestamp ?? new Date(),                       │
    // │     Dimensions: Object.entries(metric.dimensions ?? {}).map(         │
    // │       ([Name, Value]) => ({ Name, Value }),                          │
    // │     ),                                                               │
    // │   }],                                                                │
    // │ }));                                                                  │
    // └───────────────────────────────────────────────────────────────────────┘

    // 現時点: ECS/Lambda 環境では stdout JSON → CloudWatch Logs に自動転送。
    // Embedded Metrics Format (EMF) を stdout で出力することで
    // CloudWatch Metrics へ変換できる（追加 SDK 不要）。
    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: NAMESPACE,
            Dimensions: [Object.keys(metric.dimensions ?? {})],
            Metrics: [{ Name: metric.name, Unit: metric.unit }],
          },
        ],
      },
      ...metric.dimensions,
      [metric.name]: metric.value,
    };
    console.log(JSON.stringify(emf));
  }

  async publishMany(metrics: MetricDataPoint[]): Promise<void> {
    for (const m of metrics) {
      await this.publish(m);
    }
  }
}
