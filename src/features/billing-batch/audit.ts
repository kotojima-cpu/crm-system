/**
 * 月次請求バッチ 固有 AuditLog helper
 */

import { AUDIT_INVOICE_CREATED } from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";

/** バッチで作成した個別 invoice の監査ログ入力 */
export function buildMonthlyInvoiceCreatedAudit(
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
): WriteAuditLogInput {
  return {
    ...AUDIT_INVOICE_CREATED,
    recordId: invoice.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      contractId: invoice.contractId,
      customerId: invoice.customerId,
      amount: invoice.amount,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      targetMonth,
      source: "monthly_batch",
    },
  };
}

/** バッチ実行サマリーの監査ログ入力 */
export function buildMonthlyInvoiceBatchSummaryAudit(
  tenantId: TenantId | null,
  targetMonth: string,
  totalContracts: number,
  createdCount: number,
  skippedCount: number,
): WriteAuditLogInput {
  return {
    action: "create",
    resourceType: "system",
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      targetMonth,
      totalContracts,
      createdCount,
      skippedCount,
      source: "monthly_batch_summary",
    },
  };
}
