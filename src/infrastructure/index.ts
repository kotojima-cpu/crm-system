/**
 * Infrastructure 統合エクスポート
 *
 * ┌─ 利用ルール ─────────────────────────────────────────────────────────────┐
 * │                                                                          │
 * │ 1. 業務コード（src/app, src/services）から AWS SDK を直接呼ばない       │
 * │ 2. 外部通信は必ず infrastructure の interface を経由する                 │
 * │ 3. factory 経由で実装を取得し、環境に応じた自動切替を利用する           │
 * │ 4. requestId / tenantId を外部送信で必ず引き継ぐ                        │
 * │                                                                          │
 * │ ┌─ Outbox / Worker との接続 ────────────────────────────────────────┐   │
 * │ │                                                                    │   │
 * │ │ writeOutboxEvent() → commit 後に:                                 │   │
 * │ │   - QueuePublisher.publish() で SQS に送信                        │   │
 * │ │   - EventBusPublisher.publish() で EventBridge に送信             │   │
 * │ │   - WebhookDispatcher.dispatch() で HTTP 通知                     │   │
 * │ │                                                                    │   │
 * │ │ worker handler 内で:                                              │   │
 * │ │   - Mailer.send() でメール送信                                    │   │
 * │ │   - WebhookDispatcher.dispatch() で webhook 送信                  │   │
 * │ │   - ObjectStorage.putObject() でファイル保存                      │   │
 * │ │                                                                    │   │
 * │ │ AWS 固有コードは handler 本体ではなく                             │   │
 * │ │ infrastructure 実装（ses-mailer, sqs-queue 等）に寄せる           │   │
 * │ └────────────────────────────────────────────────────────────────────┘   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// Common types
export type {
  RuntimeEnvironment,
  InfrastructureMode,
  ExternalDispatchContext,
  TenantAwareExternalPayload,
  TransportResult,
} from "./types";

// Config
export {
  getRuntimeEnvironment,
  getInfrastructureMode,
  isProduction,
  isStaging,
  isAwsMode,
  getAwsRegion,
  getSesFromAddress,
  getSqsQueueUrl,
  isRealEmailDisabled,
  isRealWebhookDisabled,
  isExternalSendAllowed,
  isRealEmailSendAllowed,
  isRealWebhookSendAllowed,
  getAllowedEmailDomains,
  getAllowedWebhookHosts,
  isAllowedEmailRecipient,
  isAllowedWebhookEndpoint,
} from "./config";

// Factory
export {
  createMailer,
  createQueuePublisher,
  createWebhookDispatcher,
  createSecretProvider,
  createEventBusPublisher,
  createObjectStorage,
  createLoggerAdapter,
  createMetricsPublisher,
} from "./factory";

// Mail
export type { MailSendInput, MailSendResult, Mailer } from "./mail";

// Queue
export type { QueuePublishInput, QueuePublishResult, QueuePublisher } from "./queue";

// Webhook
export type { WebhookDispatchInput, WebhookDispatchResult, WebhookDispatcher } from "./webhook";

// Secrets
export type { SecretProvider } from "./secrets";
export { SecretResolutionError } from "./secrets";

// EventBus
export type { EventBusPublishInput, EventBusPublishResult, EventBusPublisher } from "./eventbus";

// Storage
export type { PutObjectInput, PutObjectResult, ObjectStorage } from "./storage";

// Logging
export type { StructuredLogEntry, LoggerAdapter } from "./logging";

// Metrics
export type { MetricName, MetricUnit, MetricDataPoint, MetricsPublisher } from "./metrics";

// --- 利用例（コメント） ---

/*
 * === 利用例 1: worker handler 内で Mailer を使ってメール送信する ===
 *
 * import { createMailer } from "@/infrastructure";
 *
 * registerWorkerHandler(handlerMap, "invoice.created", async ({ tx, job }) => {
 *   const { invoiceId, recipientEmail } = job.payloadEnvelope.payload;
 *   const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
 *   if (!invoice) return { status: "dead", errorMessage: "Invoice not found" };
 *
 *   assertWorkerTenantOwnership({
 *     payloadTenantId: job.payloadEnvelope.tenantId,
 *     dbTenantId: invoice.tenantId,
 *     eventType: job.eventType,
 *     resourceId: invoiceId,
 *   });
 *
 *   const mailer = createMailer();
 *   const result = await mailer.send({
 *     to: recipientEmail,
 *     subject: `請求書 #${invoice.invoiceNumber}`,
 *     html: buildInvoiceEmailHtml(invoice),
 *     tenantId: job.payloadEnvelope.tenantId,
 *     actorUserId: job.payloadEnvelope.actorUserId,
 *     requestId: job.payloadEnvelope.requestId,
 *     executionContext: job.payloadEnvelope.executionContext,
 *   });
 *
 *   if (!result.ok) {
 *     return { status: "failed", errorMessage: result.errorMessage, retryable: result.retryable };
 *   }
 *   return { status: "sent" };
 * });
 *
 * === 利用例 2: outbox dispatcher が QueuePublisher を使う ===
 *
 * import { createQueuePublisher } from "@/infrastructure";
 *
 * // commit 後に queue に publish
 * const queue = createQueuePublisher();
 * await queue.publish({
 *   eventType: resolved.eventType,
 *   executionMode: "queue",
 *   payloadJson: resolved.payloadJson,
 *   requestId: resolved.payloadEnvelope.requestId,
 *   tenantId: resolved.payloadEnvelope.tenantId,
 *   executionContext: resolved.payloadEnvelope.executionContext,
 * });
 *
 * === 利用例 3: platform 操作後に WebhookDispatcher を使う ===
 *
 * import { createWebhookDispatcher } from "@/infrastructure";
 *
 * registerWorkerHandler(handlerMap, "tenant.suspended", async ({ tx, job }) => {
 *   const webhook = createWebhookDispatcher();
 *   const result = await webhook.dispatch({
 *     endpoint: webhookUrl,
 *     eventType: "tenant.suspended",
 *     body: {
 *       tenantId: job.payloadEnvelope.tenantId,
 *       tenantName: job.payloadEnvelope.payload.tenantName,
 *       suspendedAt: job.payloadEnvelope.payload.suspendedAt,
 *     },
 *     requestId: job.payloadEnvelope.requestId,
 *     tenantId: job.payloadEnvelope.tenantId,
 *     actorUserId: job.payloadEnvelope.actorUserId,
 *     executionContext: job.payloadEnvelope.executionContext,
 *   });
 *
 *   if (!result.ok) {
 *     return { status: "failed", errorMessage: result.errorMessage, retryable: result.retryable };
 *   }
 *   return { status: "sent" };
 * });
 *
 * === 利用例 4: tenant ごとのファイル出力を ObjectStorage へ保存する ===
 *
 * import { createObjectStorage } from "@/infrastructure";
 *
 * const storage = createObjectStorage();
 * const key = `tenants/${tenantId}/invoices/${invoiceId}/report.pdf`;
 * await storage.putObject({
 *   key,
 *   body: pdfBuffer,
 *   contentType: "application/pdf",
 *   tenantId,
 *   requestId,
 * });
 */
