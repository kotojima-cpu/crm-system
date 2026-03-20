/**
 * invoice.confirmed Worker Handler
 *
 * 請求確定後の通知処理。
 * DB 再確認 → confirmed 状態確認 → customer 通知。
 */

import { createMailer } from "@/infrastructure";
import { assertWorkerTenantOwnership } from "../validators";
import type { WorkerHandlerArgs, WorkerProcessResult } from "../types";

export async function handleInvoiceConfirmed({
  tx,
  job,
}: WorkerHandlerArgs): Promise<WorkerProcessResult> {
  const { payload, tenantId, actorUserId, requestId, executionContext } =
    job.payloadEnvelope;

  const invoiceId = payload.invoiceId as number;
  if (!invoiceId) {
    return { status: "dead", errorMessage: "payload.invoiceId is missing" };
  }

  // 1. DB 再確認
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId },
  });
  if (!invoice) {
    return { status: "dead", errorMessage: `Invoice ${invoiceId} not found` };
  }

  // confirmed でない invoice に対して誤送信しない
  if (invoice.status !== "confirmed") {
    return {
      status: "dead",
      errorMessage: `Invoice ${invoiceId} is not confirmed (status: ${invoice.status})`,
    };
  }

  // 2. tenant ownership 確認
  assertWorkerTenantOwnership({
    payloadTenantId: tenantId as number | null,
    dbTenantId: invoice.tenantId,
    eventType: job.eventType,
    resourceId: invoiceId,
  });

  // 3. customer 情報取得
  const customer = await tx.customer.findFirst({
    where: { id: invoice.customerId },
    select: { companyName: true, contactEmail: true },
  });

  if (!customer?.contactEmail) {
    return { status: "sent" };
  }

  // 4. Mailer 送信
  const mailer = createMailer();
  const result = await mailer.send({
    to: customer.contactEmail,
    subject: "請求書確定のお知らせ",
    text: [
      `${customer.companyName} 様`,
      "",
      `請求書が確定されました。`,
      `金額: ¥${invoice.amount.toLocaleString()}`,
      `対象期間: ${invoice.periodStart.toISOString().slice(0, 10)} 〜 ${invoice.periodEnd.toISOString().slice(0, 10)}`,
    ].join("\n"),
    tenantId: tenantId as number | null,
    actorUserId: actorUserId as number | null,
    requestId: requestId as string,
    executionContext,
  });

  if (!result.ok) {
    return {
      status: "failed",
      errorMessage: result.errorMessage,
      retryable: result.retryable,
    };
  }

  return { status: "sent" };
}
