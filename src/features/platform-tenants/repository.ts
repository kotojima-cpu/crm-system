/**
 * Platform Tenant Repository
 *
 * platform 管理者用のテナントデータアクセス。
 * TxClient を明示的に受け取る。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId } from "@/shared/types";
import type { TenantSummary, TenantDetail, UpdateTenantContractorInput } from "./types";

const DETAIL_SELECT = {
  id: true,
  name: true,
  status: true,
  adminLoginId: true,
  contractorName: true,
  contactPerson: true,
  contactEmail: true,
  contactPhone: true,
  contactMobile: true,
  prefecture: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

/** テナントを新規作成 */
export async function create(
  tx: TxClient,
  data: {
    name: string;
    adminLoginId?: string;
    contractorName?: string;
    contactPerson?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactMobile?: string;
    prefecture?: string;
  },
): Promise<TenantDetail> {
  return tx.tenant.create({
    data: {
      name: data.name,
      status: "active",
      adminLoginId: data.adminLoginId || null,
      contractorName: data.contractorName || null,
      contactPerson: data.contactPerson || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      contactMobile: data.contactMobile || null,
      prefecture: data.prefecture || null,
    },
    select: DETAIL_SELECT,
  });
}

/** テナントに紐づく初期管理者ユーザーを作成 */
export async function createAdminUser(
  tx: TxClient,
  data: {
    tenantId: number;
    loginId: string;
    passwordHash: string;
    name: string;
  },
): Promise<{ id: number; loginId: string; name: string; role: string }> {
  const user = await tx.user.create({
    data: {
      tenantId: data.tenantId,
      loginId: data.loginId,
      passwordHash: data.passwordHash,
      name: data.name,
      role: "tenant_admin",
      isActive: true,
    },
    select: { id: true, loginId: true, name: true, role: true },
  });
  return user;
}

/** テナントを ID で取得（詳細） */
export async function findById(
  tx: TxClient,
  tenantId: TenantId,
): Promise<TenantDetail | null> {
  return tx.tenant.findUnique({
    where: { id: tenantId as number },
    select: DETAIL_SELECT,
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
    select: DETAIL_SELECT,
  });
}

/** テナントを稼働状態に更新 */
export async function markActive(
  tx: TxClient,
  tenantId: TenantId,
): Promise<TenantDetail> {
  return tx.tenant.update({
    where: { id: tenantId as number },
    data: { status: "active" },
    select: DETAIL_SELECT,
  });
}

/** テナントの契約者情報を更新 */
export async function updateContractor(
  tx: TxClient,
  tenantId: TenantId,
  input: UpdateTenantContractorInput,
): Promise<TenantDetail> {
  const data: Record<string, unknown> = {};
  if (input.contractorName !== undefined) data.contractorName = input.contractorName || null;
  // contactPerson（管理者氏名）は更新不可 — テナント作成時の値を維持
  if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail || null;
  if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone || null;
  if (input.contactMobile !== undefined) data.contactMobile = input.contactMobile || null;
  if (input.prefecture !== undefined) data.prefecture = input.prefecture || null;

  return tx.tenant.update({
    where: { id: tenantId as number },
    data,
    select: DETAIL_SELECT,
  });
}
