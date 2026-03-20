/**
 * Infrastructure Factory
 *
 * 環境に応じて local 実装 / AWS 実装を切り替える。
 *
 * ルール:
 * - local / test → local 実装を返す
 * - staging → フラグに応じて local / AWS 実装を返す
 * - production → AWS 実装を返す
 * - 業務コードは factory 経由でのみ infrastructure を取得する
 *
 * ┌─ 利用例 ─────────────────────────────────────────────────────────────┐
 * │ import { createMailer } from "@/infrastructure/factory";             │
 * │                                                                      │
 * │ const mailer = createMailer();                                       │
 * │ await mailer.send({ to: "...", subject: "...", ... });               │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { getInfrastructureMode } from "./config";
import type { Mailer } from "./mail/interface";
import type { QueuePublisher } from "./queue/interface";
import type { WebhookDispatcher } from "./webhook/interface";
import type { SecretProvider } from "./secrets/interface";
import type { EventBusPublisher } from "./eventbus/interface";
import type { ObjectStorage } from "./storage/interface";
import type { LoggerAdapter } from "./logging/interface";
import type { MetricsPublisher } from "./metrics/interface";

import { LocalMailer } from "./mail/local-mailer";
import { SesMailer } from "./mail/ses-mailer";
import { LocalQueue } from "./queue/local-queue";
import { SqsQueue } from "./queue/sqs-queue";
import { LocalWebhook } from "./webhook/local-webhook";
import { HttpWebhook } from "./webhook/http-webhook";
import { EnvSecretProvider } from "./secrets/env-secret-provider";
import { SecretsManagerProvider } from "./secrets/secrets-manager-provider";
import { LocalEventBus } from "./eventbus/local-eventbus";
import { EventBridgePublisher } from "./eventbus/eventbridge-publisher";
import { LocalStorage } from "./storage/local-storage";
import { S3Storage } from "./storage/s3-storage";
import { LocalLoggerAdapter } from "./logging/local-logger-adapter";
import { CloudWatchLoggerAdapter } from "./logging/cloudwatch-logger-adapter";
import { LocalMetricsPublisher } from "./metrics/local-metrics";
import { CloudWatchMetricsPublisher } from "./metrics/cloudwatch-metrics";

/** Mailer を作成 */
export function createMailer(): Mailer {
  return getInfrastructureMode() === "aws"
    ? new SesMailer()
    : new LocalMailer();
}

/** QueuePublisher を作成 */
export function createQueuePublisher(): QueuePublisher {
  return getInfrastructureMode() === "aws"
    ? new SqsQueue()
    : new LocalQueue();
}

/** WebhookDispatcher を作成 */
export function createWebhookDispatcher(): WebhookDispatcher {
  return getInfrastructureMode() === "aws"
    ? new HttpWebhook()
    : new LocalWebhook();
}

/** SecretProvider を作成 */
export function createSecretProvider(): SecretProvider {
  return getInfrastructureMode() === "aws"
    ? new SecretsManagerProvider()
    : new EnvSecretProvider();
}

/** EventBusPublisher を作成 */
export function createEventBusPublisher(): EventBusPublisher {
  return getInfrastructureMode() === "aws"
    ? new EventBridgePublisher()
    : new LocalEventBus();
}

/** ObjectStorage を作成 */
export function createObjectStorage(): ObjectStorage {
  return getInfrastructureMode() === "aws"
    ? new S3Storage()
    : new LocalStorage();
}

/** LoggerAdapter を作成 */
export function createLoggerAdapter(): LoggerAdapter {
  return getInfrastructureMode() === "aws"
    ? new CloudWatchLoggerAdapter()
    : new LocalLoggerAdapter();
}

/** MetricsPublisher を作成 */
export function createMetricsPublisher(): MetricsPublisher {
  return getInfrastructureMode() === "aws"
    ? new CloudWatchMetricsPublisher()
    : new LocalMetricsPublisher();
}
