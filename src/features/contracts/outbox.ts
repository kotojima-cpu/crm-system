/**
 * Contract feature 固有 Outbox helper
 */

import { OUTBOX_CONTRACT_CREATED, OUTBOX_CONTRACT_UPDATED } from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type { ContractDetail } from "./types";

/** 契約作成の outbox イベント入力 */
export function buildContractCreatedOutbox(
  contract: ContractDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_CONTRACT_CREATED,
    tenantId,
    jobType: "contract.created",
    resourceId: contract.id,
    payload: {
      contractId: contract.id,
      customerId: contract.customerId,
      productName: contract.productName,
    },
  };
}

/** 契約更新の outbox イベント入力 */
export function buildContractUpdatedOutbox(
  contract: ContractDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_CONTRACT_UPDATED,
    tenantId,
    jobType: "contract.updated",
    resourceId: contract.id,
    payload: {
      contractId: contract.id,
      customerId: contract.customerId,
      productName: contract.productName,
    },
  };
}
