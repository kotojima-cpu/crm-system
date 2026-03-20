/**
 * Platform Tenant Service
 *
 * platform 管理者によるテナント管理。
 * withPlatformTx を使用し、AuditLog 原則必須。
 * 停止通知は outbox 経由で行い、即時外部通知しない。
 */

import { withPlatformTx } from "@/shared/db";
import { NotFoundError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type {
  ListTenantsInput,
  ListTenantsResult,
  SuspendTenantInput,
  TenantDetail,
  PlatformTenantServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildTenantSuspendedAudit } from "./audit";
import { buildTenantSuspendedOutbox } from "./outbox";

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

/** テナント停止予約登録 */
export async function suspendTenant(
  ctx: PlatformTenantServiceContext,
  tenantId: TenantId,
  input: SuspendTenantInput,
): Promise<TenantDetail> {
  return withPlatformTx(async (tx) => {
    // テナント存在確認
    const tenant = await repo.findById(tx, tenantId);
    if (!tenant) {
      throw new NotFoundError("テナント");
    }

    // すでに停止済みの場合は冪等 — 何もせず返す
    if (tenant.status === "suspended") {
      return tenant;
    }

    // 停止実行
    const updated = await repo.markSuspended(tx, tenantId);

    // AuditLog（platform 操作は必須）
    await writeAuditLog(tx, buildTenantSuspendedAudit(updated, input, tenantId));

    // Outbox（停止通知は worker が後で処理する）
    await writeOutboxEvent(tx, buildTenantSuspendedOutbox(updated, input, tenantId));

    return updated;
  });
}
