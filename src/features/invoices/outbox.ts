/**
 * Invoice feature 固有 Outbox helper
 */

import {
  OUTBOX_INVOICE_CREATED,
  OUTBOX_INVOICE_CONFIRMED,
  OUTBOX_INVOICE_CANCELLED,
} from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type { InvoiceDetail } from "./types";

/** 請求作成の outbox イベント入力 */
export function buildInvoiceCreatedOutbox(
  invoice: InvoiceDetail,
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
    },
  };
}

/** 請求確定の outbox イベント入力 */
export function buildInvoiceConfirmedOutbox(
  invoice: InvoiceDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_INVOICE_CONFIRMED,
    tenantId,
    jobType: "invoice.confirmed",
    resourceId: invoice.id,
    payload: {
      invoiceId: invoice.id,
      contractId: invoice.contractId,
      customerId: invoice.customerId,
      amount: invoice.amount,
    },
  };
}

/** 請求キャンセルの outbox イベント入力 */
export function buildInvoiceCancelledOutbox(
  invoice: InvoiceDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_INVOICE_CANCELLED,
    tenantId,
    jobType: "invoice.cancelled",
    resourceId: invoice.id,
    payload: {
      invoiceId: invoice.id,
      contractId: invoice.contractId,
      customerId: invoice.customerId,
      cancelReason: invoice.cancelReason,
    },
  };
}
