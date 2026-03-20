/**
 * Platform Tenant Repository
 *
 * platform 管理者用のテナントデータアクセス。
 * TxClient を明示的に受け取る。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId } from "@/shared/types";
import type { TenantSummary, TenantDetail } from "./types";

/** テナント一覧を取得 */
export async function findMany(
  tx: TxClient,
  options: { page: number; limit: number },
): Promise<{ data: TenantSummary[]; total: number }> {
  const { page, limit } = options;

  const [data, total] = await Promise.all([
    tx.tenant.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    tx.tenant.count(),
  ]);

  return { data, total };
}

/** テナントを ID で取得 */
export async function findById(
  tx: TxClient,
  tenantId: TenantId,
): Promise<TenantDetail | null> {
  return tx.tenant.findUnique({
    where: { id: tenantId as number },
  });
}

/** テナントを停止状態に更新 */
export async function markSuspended(
  tx: TxClient,
  tenantId: TenantId,
): Promise<TenantDetail> {
  return tx.tenant.update({
    where: { id: tenantId as number },
    data: { status: "suspended" },
  });
}
