/**
 * Contract feature 固有 AuditLog helper
 */

import { AUDIT_CONTRACT_CREATED, AUDIT_CONTRACT_UPDATED } from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { ContractDetail, UpdateContractInput } from "./types";

/** 契約作成の監査ログ入力 */
export function buildContractCreatedAudit(
  contract: ContractDetail,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_CONTRACT_CREATED,
    recordId: contract.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      customerId: contract.customerId,
      productName: contract.productName,
      contractStartDate: contract.contractStartDate,
      contractEndDate: contract.contractEndDate,
      monthlyFee: contract.monthlyFee,
    },
  };
}

/** 契約更新の監査ログ入力 */
export function buildContractUpdatedAudit(
  existing: ContractDetail,
  updated: ContractDetail,
  input: UpdateContractInput,
  tenantId: TenantId,
): WriteAuditLogInput {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(input) as (keyof UpdateContractInput)[]) {
    if (input[key] !== undefined) {
      oldValues[key] = existing[key as keyof ContractDetail];
      newValues[key] = updated[key as keyof ContractDetail];
    }
  }

  return {
    ...AUDIT_CONTRACT_UPDATED,
    recordId: existing.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    oldValues,
    newValues,
  };
}
