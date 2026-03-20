/**
 * 月次請求バッチ 固有 Outbox helper
 */

import { OUTBOX_INVOICE_CREATED } from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";

/** バッチで作成した個別 invoice の outbox イベント入力 */
export function buildMonthlyInvoiceCreatedOutbox(
  invoice: {
    id: number;
    contractId: number;
    customerId: number;
    amount: number;
    periodStart: Date;
    periodEnd: Date;
  },
  targetMonth: string,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_INVOICE_CREATED,
    tenantId,
    jobType: "invoice.created",
    resourceId: invoice.id,
    payload: {
      invoiceId: invoice.id,
      contractId: invoice.contractId,
      customerId: invoice.customerId,
      amount: invoice.amount,
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: invoice.periodEnd.toISOString(),
      targetMonth,
      source: "monthly_batch",
    },
  };
}
