/**
 * Tenant User Repository
 *
 * tenant スコープのユーザー・招待データアクセス。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId } from "@/shared/types";
import type { TenantUserSummary, InvitationRecord } from "./types";

/** tenant スコープでユーザー一覧を取得 */
export async function findManyByTenant(
  tx: TxClient,
  tenantId: TenantId,
  options: { page: number; limit: number },
): Promise<{ data: TenantUserSummary[]; total: number }> {
  const { page, limit } = options;

  const where = { tenantId: tenantId as number };

  const [data, total] = await Promise.all([
    tx.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    tx.user.count({ where }),
  ]);

  return { data, total };
}

/** tenant スコープで招待を作成 */
export async function createInvitationForTenant(
  tx: TxClient,
  tenantId: TenantId,
  input: {
    email: string;
    role: string;
    invitedBy: number;
    expiresAt: Date;
  },
): Promise<InvitationRecord> {
  return tx.tenantUserInvitation.create({
    data: {
      tenantId: tenantId as number,
      email: input.email,
      role: input.role,
      invitedBy: input.invitedBy,
      expiresAt: input.expiresAt,
    },
  });
}

/** 同一テナント・メールで pending 招待が存在するか確認 */
export async function findPendingInvitationByEmail(
  tx: TxClient,
  tenantId: TenantId,
  email: string,
): Promise<InvitationRecord | null> {
  return tx.tenantUserInvitation.findFirst({
    where: {
      tenantId: tenantId as number,
      email,
      status: "pending",
    },
  });
}
