/**
 * Contract Service
 */

import { withTenantTx } from "@/shared/db";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type {
  ListContractsInput,
  ListContractsResult,
  CreateContractInput,
  UpdateContractInput,
  ContractDetail,
  ContractServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildContractCreatedAudit, buildContractUpdatedAudit } from "./audit";
import { buildContractCreatedOutbox, buildContractUpdatedOutbox } from "./outbox";

/** 契約一覧取得 */
export async function listContracts(
  ctx: ContractServiceContext,
  input: ListContractsInput,
): Promise<ListContractsResult> {
  const { data, total } = await withTenantTx(ctx.tenantId, async (tx) => {
    return repo.findManyByTenant(tx, ctx.tenantId, {
      page: input.page,
      limit: input.limit,
      customerId: input.customerId,
      status: input.status,
    });
  });

  return {
    data,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

/** 契約詳細取得 */
export async function getContractById(
  ctx: ContractServiceContext,
  contractId: number,
): Promise<ContractDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const contract = await repo.findByIdAndTenant(tx, contractId, ctx.tenantId);
    if (!contract) {
      throw new NotFoundError("契約");
    }
    return contract;
  });
}

/** 契約新規作成 */
export async function createContract(
  ctx: ContractServiceContext,
  input: CreateContractInput,
): Promise<ContractDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    // 顧客の tenant 整合チェック
    const customer = await repo.findCustomerByIdAndTenant(
      tx,
      input.customerId,
      ctx.tenantId,
    );
    if (!customer) {
      throw new ValidationError("指定された顧客が見つかりません");
    }

    const contract = await repo.createForTenant(tx, ctx.tenantId, ctx.actorUserId, input);

    await writeAuditLog(tx, buildContractCreatedAudit(contract, ctx.tenantId));
    await writeOutboxEvent(tx, buildContractCreatedOutbox(contract, ctx.tenantId));

    return contract;
  });
}

/** 契約更新 */
export async function updateContract(
  ctx: ContractServiceContext,
  contractId: number,
  input: UpdateContractInput,
): Promise<ContractDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const existing = await repo.findByIdAndTenant(tx, contractId, ctx.tenantId);
    if (!existing) {
      throw new NotFoundError("契約");
    }

    const updated = await repo.updateForTenant(tx, contractId, input);

    await writeAuditLog(
      tx,
      buildContractUpdatedAudit(existing, updated, input, ctx.tenantId),
    );
    await writeOutboxEvent(tx, buildContractUpdatedOutbox(updated, ctx.tenantId));

    return updated;
  });
}
