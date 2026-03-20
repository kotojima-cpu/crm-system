/**
 * Customer Service
 *
 * ユースケース本体。transaction 制御・repository 呼び出し・AuditLog・Outbox を統合する。
 * route handler は薄く保ち、ロジックはここに集約する。
 */

import { withTenantTx } from "@/shared/db";
import { NotFoundError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type {
  ListCustomersInput,
  ListCustomersResult,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerDetail,
  CustomerServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildCustomerCreatedAudit, buildCustomerUpdatedAudit } from "./audit";
import { buildCustomerCreatedOutbox, buildCustomerUpdatedOutbox } from "./outbox";

/** 顧客一覧取得 */
export async function listCustomers(
  ctx: CustomerServiceContext,
  input: ListCustomersInput,
): Promise<ListCustomersResult> {
  const { data, total } = await withTenantTx(ctx.tenantId, async (tx) => {
    return repo.findManyByTenant(tx, ctx.tenantId, {
      page: input.page,
      limit: input.limit,
      search: input.search,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
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

/** 顧客詳細取得 */
export async function getCustomerById(
  ctx: CustomerServiceContext,
  customerId: number,
): Promise<CustomerDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const customer = await repo.findByIdAndTenant(tx, customerId, ctx.tenantId);
    if (!customer) {
      throw new NotFoundError("顧客");
    }
    return customer;
  });
}

/** 顧客新規作成 */
export async function createCustomer(
  ctx: CustomerServiceContext,
  input: CreateCustomerInput,
): Promise<CustomerDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const customer = await repo.createForTenant(
      tx,
      ctx.tenantId,
      ctx.actorUserId,
      input,
    );

    // AuditLog
    await writeAuditLog(tx, buildCustomerCreatedAudit(customer, input, ctx.tenantId));

    // Outbox
    await writeOutboxEvent(tx, buildCustomerCreatedOutbox(customer, ctx.tenantId));

    return customer;
  });
}

/** 顧客更新 */
export async function updateCustomer(
  ctx: CustomerServiceContext,
  customerId: number,
  input: UpdateCustomerInput,
): Promise<CustomerDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    // 既存レコード取得 + tenant 所有確認
    const existing = await repo.findByIdAndTenant(tx, customerId, ctx.tenantId);
    if (!existing) {
      throw new NotFoundError("顧客");
    }

    // 更新
    const updated = await repo.updateForTenant(tx, customerId, ctx.tenantId, input);

    // AuditLog
    await writeAuditLog(
      tx,
      buildCustomerUpdatedAudit(existing, updated, input, ctx.tenantId),
    );

    // Outbox
    await writeOutboxEvent(tx, buildCustomerUpdatedOutbox(updated, ctx.tenantId));

    return updated;
  });
}
