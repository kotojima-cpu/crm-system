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

/** 停止予約の入力 */
export interface SuspendTenantInput {
  reason: string;
}

/** service 呼び出し時の共通パラメータ */
export interface PlatformTenantServiceContext {
  actorUserId: ActorUserId;
  actorRole: string;
}
