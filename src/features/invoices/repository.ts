/**
 * Invoice Repository
 *
 * tenant スコープの請求データアクセス。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId, ActorUserId } from "@/shared/types";
import type { InvoiceSummary, InvoiceDetail, CreateInvoiceInput } from "./types";

/** tenant スコープで請求一覧を取得 */
export async function findManyByTenant(
  tx: TxClient,
  tenantId: TenantId,
  options: { page: number; limit: number; contractId?: number; status?: string },
): Promise<{ data: InvoiceSummary[]; total: number }> {
  const { page, limit, contractId, status } = options;

  const where: Record<string, unknown> = { tenantId: tenantId as number };
  if (contractId) where.contractId = contractId;
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    tx.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        contractId: true,
        customerId: true,
        periodStart: true,
        periodEnd: true,
        amount: true,
        status: true,
      },
    }),
    tx.invoice.count({ where }),
  ]);

  return { data, total };
}

/** tenant スコープで請求を ID 取得 */
export async function findByIdAndTenant(
  tx: TxClient,
  invoiceId: number,
  tenantId: TenantId,
): Promise<InvoiceDetail | null> {
  return tx.invoice.findFirst({
    where: { id: invoiceId, tenantId: tenantId as number },
  });
}

/** tenant スコープで契約を確認（請求作成時の整合チェック用） */
export async function findContractByIdAndTenant(
  tx: TxClient,
  contractId: number,
  tenantId: TenantId,
): Promise<{ id: number; tenantId: number; customerId: number } | null> {
  return tx.leaseContract.findFirst({
    where: { id: contractId, tenantId: tenantId as number },
    select: { id: true, tenantId: true, customerId: true },
  });
}

/** 同一契約・同一期間で draft/confirmed の請求が存在するか確認 */
export async function findExistingInvoiceForPeriod(
  tx: TxClient,
  tenantId: TenantId,
  contractId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<InvoiceDetail | null> {
  return tx.invoice.findFirst({
    where: {
      tenantId: tenantId as number,
      contractId,
      periodStart,
      periodEnd,
      status: { in: ["draft", "confirmed"] },
    },
  });
}

/** tenant スコープで請求を作成 */
export async function createForTenant(
  tx: TxClient,
  tenantId: TenantId,
  actorUserId: ActorUserId,
  input: CreateInvoiceInput,
  customerId: number,
): Promise<InvoiceDetail> {
  return tx.invoice.create({
    data: {
      tenantId: tenantId as number,
      contractId: input.contractId,
      customerId,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      amount: input.amount,
      status: "draft",
      createdBy: actorUserId as number,
    },
  });
}

/** 請求を confirmed に更新 */
export async function markConfirmed(
  tx: TxClient,
  invoiceId: number,
): Promise<InvoiceDetail> {
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { status: "confirmed", confirmedAt: new Date() },
  });
}

/** 請求を cancelled に更新 */
export async function markCancelled(
  tx: TxClient,
  invoiceId: number,
  reason: string,
): Promise<InvoiceDetail> {
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { status: "cancelled", cancelReason: reason, cancelledAt: new Date() },
  });
}
