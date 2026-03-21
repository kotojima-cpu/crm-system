/**
 * Platform Tenant Service
 *
 * platform 管理者によるテナント管理。
 * withPlatformTx を使用し、AuditLog 原則必須。
 */

import { hash } from "bcryptjs";
import { withPlatformTx } from "@/shared/db";
import { NotFoundError, ConflictError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type {
  CreateTenantInput,
  CreateTenantResult,
  ListTenantsInput,
  ListTenantsResult,
  SuspendTenantInput,
  ResumeTenantInput,
  UpdateTenantContractorInput,
  TenantDetail,
  PlatformTenantServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildTenantCreatedAudit, buildTenantSuspendedAudit, buildTenantResumedAudit } from "./audit";
import { buildTenantSuspendedOutbox } from "./outbox";

/** テナント新規作成 + 初期管理者ユーザー作成 */
export async function createTenant(
  _ctx: PlatformTenantServiceContext,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const passwordHash = await hash(input.adminPassword, 12);

  return withPlatformTx(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { loginId: input.adminLoginId },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictError(`ログインID "${input.adminLoginId}" は既に使用されています`);
    }

    const tenant = await repo.create(tx, {
      name: input.tenantName,
      contractorName: input.contractorName,
      contactPerson: input.contactPerson,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactMobile: input.contactMobile,
      prefecture: input.prefecture,
    });

    const adminUser = await repo.createAdminUser(tx, {
      tenantId: tenant.id,
      loginId: input.adminLoginId,
      passwordHash,
      name: input.adminName,
    });

    await writeAuditLog(tx, buildTenantCreatedAudit(tenant, input));

    return { tenant, adminUser };
  });
}

/** テナント詳細取得 */
export async function getTenantDetail(
  _ctx: PlatformTenantServiceContext,
  tenantId: TenantId,
): Promise<TenantDetail> {
  return withPlatformTx(async (tx) => {
    const tenant = await repo.findById(tx, tenantId);
    if (!tenant) {
      throw new NotFoundError("テナント");
    }
    return tenant;
  });
}

/** テナント一覧取得 */
export async function listTenants(
  _ctx: PlatformTenantServiceContext,
  input: ListTenantsInput,
): Promise<ListTenantsResult> {
  const { data, total } = await withPlatformTx(async (tx) => {
    return repo.findMany(tx, { page: input.page, limit: input.limit });
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

/** テナント停止 */
export async function suspendTenant(
  ctx: PlatformTenantServiceContext,
  tenantId: TenantId,
  input: SuspendTenantInput,
): Promise<TenantDetail> {
  return withPlatformTx(async (tx) => {
    const tenant = await repo.findById(tx, tenantId);
    if (!tenant) throw new NotFoundError("テナント");
    if (tenant.status === "suspended") return tenant;

    const updated = await repo.markSuspended(tx, tenantId);
    await writeAuditLog(tx, buildTenantSuspendedAudit(updated, input, tenantId));
    await writeOutboxEvent(tx, buildTenantSuspendedOutbox(updated, input, tenantId));
    return updated;
  });
}

/** テナント再開 */
export async function resumeTenant(
  _ctx: PlatformTenantServiceContext,
  tenantId: TenantId,
  input: ResumeTenantInput,
): Promise<TenantDetail> {
  return withPlatformTx(async (tx) => {
    const tenant = await repo.findById(tx, tenantId);
    if (!tenant) throw new NotFoundError("テナント");
    if (tenant.status === "active") return tenant;

    const updated = await repo.markActive(tx, tenantId);
    await writeAuditLog(tx, buildTenantResumedAudit(updated, input, tenantId));
    return updated;
  });
}

/** テナント契約者情報更新 */
export async function updateTenantContractor(
  _ctx: PlatformTenantServiceContext,
  tenantId: TenantId,
  input: UpdateTenantContractorInput,
): Promise<TenantDetail> {
  return withPlatformTx(async (tx) => {
    const tenant = await repo.findById(tx, tenantId);
    if (!tenant) throw new NotFoundError("テナント");
    return repo.updateContractor(tx, tenantId, input);
  });
}
