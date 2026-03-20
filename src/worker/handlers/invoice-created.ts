/**
 * invoice.created Worker Handler
 *
 * 請求作成後の通知処理。
 * DB 再確認 → tenant ownership → customer 情報取得 → Mailer 送信。
 */

import { createMailer } from "@/infrastructure";
import { assertWorkerTenantOwnership } from "../validators";
import type { WorkerHandlerArgs, WorkerProcessResult } from "../types";

export async function handleInvoiceCreated({
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

  // 2. tenant ownership 確認
  assertWorkerTenantOwnership({
    payloadTenantId: tenantId as number | null,
    dbTenantId: invoice.tenantId,
    eventType: job.eventType,
    resourceId: invoiceId,
  });

  // 3. customer + contract 情報取得
  const contract = await tx.leaseContract.findFirst({
    where: { id: invoice.contractId },
    select: { productName: true, customerId: true },
  });

  const customer = await tx.customer.findFirst({
    where: { id: invoice.customerId },
    select: { companyName: true, contactEmail: true },
  });

  // 通知先メールがない場合はスキップ（dead ではなく sent 扱い）
  if (!customer?.contactEmail) {
    return { status: "sent" };
  }

  // 4. Mailer 経由でメール送信
  const mailer = createMailer();
  const result = await mailer.send({
    to: customer.contactEmail,
    subject: `請求書作成のお知らせ — ${contract?.productName ?? ""}`,
    text: [
      `${customer.companyName} 様`,
      "",
      `請求書が作成されました。`,
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
