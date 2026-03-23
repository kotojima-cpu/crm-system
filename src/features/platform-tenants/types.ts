/**
 * Platform Tenant 管理 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** テナント概要（一覧用） */
export interface TenantSummary {
  id: number;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** テナント詳細 */
export interface TenantDetail {
  id: number;
  name: string;
  status: string;
  adminLoginId: string | null;
  contractorName: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactMobile: string | null;
  prefecture: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 一覧取得の入力 */
export interface ListTenantsInput {
  page: number;
  limit: number;
}

/** 一覧取得のレスポンス */
export interface ListTenantsResult {
  data: TenantSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** テナント新規作成の入力 */
export interface CreateTenantInput {
  tenantName: string;
  adminName: string;
  adminLoginId: string;
  adminPassword: string;
  contractorName?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactMobile?: string;
  prefecture?: string;
}

/** テナント新規作成のレスポンス */
export interface CreateTenantResult {
  tenant: TenantDetail;
  adminUser: {
    id: number;
    loginId: string;
    name: string;
    role: string;
  };
}

/** 契約者情報更新の入力 */
export interface UpdateTenantContractorInput {
  contractorName?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactMobile?: string;
  prefecture?: string;
}

/** 停止予約の入力 */
export interface SuspendTenantInput {
  reason: string;
}

/** 再開の入力 */
export interface ResumeTenantInput {
  reason: string;
}

/** service 呼び出し時の共通パラメータ */
export interface PlatformTenantServiceContext {
  actorUserId: ActorUserId;
  actorRole: string;
}
