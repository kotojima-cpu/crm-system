/**
 * Worker Handler Registry
 *
 * eventType ごとの handler を登録・取得する。
 * 未登録 eventType は WorkerHandlerNotFoundError で拒否する。
 *
 * 各 handler は以下の責務を持つ:
 * - DB 再確認（レコード存在確認、ステータス確認）
 * - tenant 所有権確認（assertWorkerTenantOwnership）
 * - 業務処理実行
 * - 結果を WorkerProcessResult で返す
 *
 * handler は payload のみで処理を完結してはならない。
 */

import type { WorkerHandler, WorkerHandlerMap } from "./types";
import { WorkerHandlerNotFoundError } from "./errors";

/**
 * handler マップを作成する。
 */
export function createWorkerHandlerMap(): WorkerHandlerMap {
  return new Map<string, WorkerHandler>();
}

/**
 * handler を登録する。
 */
export function registerWorkerHandler(
  map: WorkerHandlerMap,
  eventType: string,
  handler: WorkerHandler,
): void {
  map.set(eventType, handler);
}

/**
 * handler を取得する。
 * 未登録の場合は WorkerHandlerNotFoundError を投げる。
 */
export function getWorkerHandler(
  map: WorkerHandlerMap,
  eventType: string,
): WorkerHandler {
  const handler = map.get(eventType);
  if (!handler) {
    throw new WorkerHandlerNotFoundError(eventType);
  }
  return handler;
}

// --- Infrastructure 接続点（Phase 8） ---
//
// handler 内で外部通信を行う場合は infrastructure の factory を使う:
//
//   import { createMailer, createWebhookDispatcher, createObjectStorage } from "@/infrastructure";
//
//   const mailer = createMailer();
//   const webhook = createWebhookDispatcher();
//   const storage = createObjectStorage();
//
// handler 本体で AWS SDK を直接呼ばないこと。

// --- サンプル handler（コメント） ---

/*
 * === handler 実装例 1: invoice.created（Mailer 経由でメール送信） ===
 *
 * import { createMailer } from "@/infrastructure";
 *
 * registerWorkerHandler(handlerMap, "invoice.created", async ({ tx, job }) => {
 *   const { invoiceId, recipientEmail } = job.payloadEnvelope.payload;
 *
 *   // DB 再確認
 *   const invoice = await tx.invoice.findUnique({ where: { id: invoiceId as number } });
 *   if (!invoice) {
 *     return { status: "dead", errorMessage: `Invoice ${invoiceId} not found` };
 *   }
 *
 *   // tenant 所有権確認
 *   assertWorkerTenantOwnership({
 *     payloadTenantId: job.payloadEnvelope.tenantId as number | null,
 *     dbTenantId: invoice.tenantId,
 *     eventType: job.eventType,
 *     resourceId: invoiceId,
 *   });
 *
 *   // Mailer 経由でメール送信（AWS SDK 直接呼出し禁止）
 *   const mailer = createMailer();
 *   const result = await mailer.send({
 *     to: recipientEmail as string,
 *     subject: `請求書 #${invoice.invoiceNumber}`,
 *     html: buildInvoiceEmailHtml(invoice),
 *     tenantId: job.payloadEnvelope.tenantId as number | null,
 *     actorUserId: job.payloadEnvelope.actorUserId as number | null,
 *     requestId: job.payloadEnvelope.requestId as string,
 *     executionContext: job.payloadEnvelope.executionContext,
 *   });
 *
 *   if (!result.ok) {
 *     return { status: "failed", errorMessage: result.errorMessage, retryable: result.retryable };
 *   }
 *   return { status: "sent" };
 * });
 *
 * === handler 実装例 2: tenant.suspended（WebhookDispatcher 経由） ===
 *
 * import { createWebhookDispatcher } from "@/infrastructure";
 *
 * registerWorkerHandler(handlerMap, "tenant.suspended", async ({ tx, job }) => {
 *   const { tenantId, tenantName } = job.payloadEnvelope.payload;
 *
 *   const webhook = createWebhookDispatcher();
 *   const result = await webhook.dispatch({
 *     endpoint: webhookUrl,
 *     eventType: "tenant.suspended",
 *     body: { tenantId, tenantName },
 *     requestId: job.payloadEnvelope.requestId as string,
 *     tenantId: job.payloadEnvelope.tenantId as number | null,
 *     actorUserId: job.payloadEnvelope.actorUserId as number | null,
 *     executionContext: job.payloadEnvelope.executionContext,
 *   });
 *
 *   if (!result.ok) {
 *     return { status: "failed", errorMessage: result.errorMessage, retryable: result.retryable };
 *   }
 *   return { status: "sent" };
 * });
 *
 * === handler 実装例 3: email.send（Mailer 経由） ===
 *
 * import { createMailer } from "@/infrastructure";
 *
 * registerWorkerHandler(handlerMap, "email.send", async ({ tx, job }) => {
 *   const { to, templateId, tenantName } = job.payloadEnvelope.payload;
 *
 *   const mailer = createMailer();
 *   const result = await mailer.send({
 *     to: to as string,
 *     subject: `通知: ${templateId}`,
 *     text: `テナント: ${tenantName}`,
 *     tenantId: job.payloadEnvelope.tenantId as number | null,
 *     actorUserId: job.payloadEnvelope.actorUserId as number | null,
 *     requestId: job.payloadEnvelope.requestId as string,
 *     executionContext: job.payloadEnvelope.executionContext,
 *   });
 *
 *   if (!result.ok) {
 *     return { status: "failed", errorMessage: result.errorMessage, retryable: result.retryable };
 *   }
 *   return { status: "sent" };
 * });
 */
