/**
 * Contract Repository
 *
 * tenant スコープの契約データアクセス。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId, ActorUserId } from "@/shared/types";
import type {
  ContractSummary,
  ContractDetail,
  CreateContractInput,
  UpdateContractInput,
} from "./types";

/** tenant スコープで契約一覧を取得 */
export async function findManyByTenant(
  tx: TxClient,
  tenantId: TenantId,
  options: {
    page: number;
    limit: number;
    customerId?: number;
    status?: string;
  },
): Promise<{ data: ContractSummary[]; total: number }> {
  const { page, limit, customerId, status } = options;

  const where: Record<string, unknown> = { tenantId: tenantId as number };
  if (customerId) where.customerId = customerId;
  if (status) where.contractStatus = status;

  const [data, total] = await Promise.all([
    tx.leaseContract.findMany({
      where,
      orderBy: { contractStartDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        customerId: true,
        contractNumber: true,
        productName: true,
        contractStartDate: true,
        contractEndDate: true,
        contractStatus: true,
        monthlyFee: true,
      },
    }),
    tx.leaseContract.count({ where }),
  ]);

  return { data, total };
}

/** tenant スコープで契約を ID 取得 */
export async function findByIdAndTenant(
  tx: TxClient,
  contractId: number,
  tenantId: TenantId,
): Promise<ContractDetail | null> {
  return tx.leaseContract.findFirst({
    where: { id: contractId, tenantId: tenantId as number },
  });
}

/** tenant スコープで顧客を確認（契約作成時の整合チェック用） */
export async function findCustomerByIdAndTenant(
  tx: TxClient,
  customerId: number,
  tenantId: TenantId,
): Promise<{ id: number; tenantId: number } | null> {
  return tx.customer.findFirst({
    where: { id: customerId, tenantId: tenantId as number, isDeleted: false },
    select: { id: true, tenantId: true },
  });
}

/** tenant スコープで契約を作成 */
export async function createForTenant(
  tx: TxClient,
  tenantId: TenantId,
  actorUserId: ActorUserId,
  input: CreateContractInput,
): Promise<ContractDetail> {
  return tx.leaseContract.create({
    data: {
      tenantId: tenantId as number,
      customerId: input.customerId,
      contractNumber: input.contractNumber ?? null,
      productName: input.productName,
      leaseCompanyName: input.leaseCompanyName ?? null,
      contractStartDate: new Date(input.contractStartDate),
      contractEndDate: new Date(input.contractEndDate),
      contractMonths: input.contractMonths,
      monthlyFee: input.monthlyFee ?? null,
      counterBaseFee: input.counterBaseFee ?? null,
      monoCounterRate: input.monoCounterRate ?? null,
      colorCounterRate: input.colorCounterRate ?? null,
      billingBaseDay: input.billingBaseDay ?? null,
      notes: input.notes ?? null,
      createdBy: actorUserId as number,
    },
  });
}

/** tenant スコープで契約を更新 */
export async function updateForTenant(
  tx: TxClient,
  contractId: number,
  input: UpdateContractInput,
): Promise<ContractDetail> {
  const updateData: Record<string, unknown> = {};

  if (input.contractNumber !== undefined) updateData.contractNumber = input.contractNumber;
  if (input.productName !== undefined) updateData.productName = input.productName;
  if (input.leaseCompanyName !== undefined) updateData.leaseCompanyName = input.leaseCompanyName;
  if (input.monthlyFee !== undefined) updateData.monthlyFee = input.monthlyFee;
  if (input.counterBaseFee !== undefined) updateData.counterBaseFee = input.counterBaseFee;
  if (input.monoCounterRate !== undefined) updateData.monoCounterRate = input.monoCounterRate;
  if (input.colorCounterRate !== undefined) updateData.colorCounterRate = input.colorCounterRate;
  if (input.billingBaseDay !== undefined) updateData.billingBaseDay = input.billingBaseDay;
  if (input.contractStatus !== undefined) updateData.contractStatus = input.contractStatus;
  if (input.notes !== undefined) updateData.notes = input.notes;

  return tx.leaseContract.update({
    where: { id: contractId },
    data: updateData,
  });
}
