/**
 * Tenant User 管理 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** テナントユーザー概要（一覧用） */
export interface TenantUserSummary {
  id: number;
  name: string;
  loginId: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

/** 一覧取得の入力 */
export interface ListTenantUsersInput {
  tenantId: TenantId;
  page: number;
  limit: number;
}

/** 一覧取得のレスポンス */
export interface ListTenantUsersResult {
  data: TenantUserSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 招待予約の入力 */
export interface CreateInvitationInput {
  email: string;
  role: "tenant_admin" | "sales";
}

/** 招待レコード */
export interface InvitationRecord {
  id: number;
  tenantId: number;
  email: string;
  role: string;
  token: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

/** service 呼び出し時の共通パラメータ */
export interface TenantUserServiceContext {
  tenantId: TenantId;
  actorUserId: ActorUserId;
  actorRole: string;
}
