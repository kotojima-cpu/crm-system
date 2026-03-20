/**
 * Invoice feature 固有 AuditLog helper
 */

import {
  AUDIT_INVOICE_CREATED,
  AUDIT_INVOICE_CONFIRMED,
  AUDIT_INVOICE_CANCELLED,
} from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { InvoiceDetail } from "./types";

/** 請求作成の監査ログ入力 */
export function buildInvoiceCreatedAudit(
  invoice: InvoiceDetail,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_INVOICE_CREATED,
    recordId: invoice.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      contractId: invoice.contractId,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      amount: invoice.amount,
      status: invoice.status,
    },
  };
}

/** 請求確定の監査ログ入力 */
export function buildInvoiceConfirmedAudit(
  invoice: InvoiceDetail,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_INVOICE_CONFIRMED,
    recordId: invoice.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    oldValues: { status: "draft" },
    newValues: { status: "confirmed", confirmedAt: invoice.confirmedAt },
  };
}

/** 請求キャンセルの監査ログ入力 */
export function buildInvoiceCancelledAudit(
  invoice: InvoiceDetail,
  oldStatus: string,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_INVOICE_CANCELLED,
    recordId: invoice.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    oldValues: { status: oldStatus },
    newValues: { status: "cancelled", cancelReason: invoice.cancelReason },
  };
}
