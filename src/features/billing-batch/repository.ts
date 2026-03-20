/**
 * 月次請求バッチ Repository
 *
 * tenant スコープのバッチ対象データアクセス。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId } from "@/shared/types";
import type { BillableContract } from "./types";

/**
 * tenant スコープで対象月にアクティブな契約一覧を取得する。
 *
 * 対象条件:
 * - contractStatus = "active" or "expiring_soon"
 * - contractStartDate <= periodEnd
 * - contractEndDate >= periodStart
 */
export async function findActiveContractsForTenantAndMonth(
  tx: TxClient,
  tenantId: TenantId,
  periodStart: Date,
  periodEnd: Date,
): Promise<BillableContract[]> {
  return tx.leaseContract.findMany({
    where: {
      tenantId: tenantId as number,
      contractStatus: { in: ["active", "expiring_soon"] },
      contractStartDate: { lte: periodEnd },
      contractEndDate: { gte: periodStart },
    },
    select: {
      id: true,
      tenantId: true,
      customerId: true,
      productName: true,
      contractStartDate: true,
      contractEndDate: true,
      monthlyFee: true,
      billingBaseDay: true,
      contractStatus: true,
    },
    orderBy: { id: "asc" },
  });
}

/**
 * バッチ対象のアクティブ tenant 一覧を取得する。
 */
export async function findActiveTenantsForBatch(
  tx: TxClient,
): Promise<{ id: number; name: string }[]> {
  return tx.tenant.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

/**
 * 同一契約・同一期間で draft/confirmed の請求が存在するか確認。
 */
export async function findExistingInvoiceForContractAndMonth(
  tx: TxClient,
  tenantId: TenantId,
  contractId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ id: number; status: string } | null> {
  return tx.invoice.findFirst({
    where: {
      tenantId: tenantId as number,
      contractId,
      periodStart,
      periodEnd,
      status: { in: ["draft", "confirmed"] },
    },
    select: { id: true, status: true },
  });
}
