/**
 * Customer feature 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** 顧客一覧取得の検索条件 */
export interface ListCustomersInput {
  tenantId: TenantId;
  page: number;
  limit: number;
  search?: string;
  sortBy?: "companyName" | "companyNameKana" | "updatedAt" | "createdAt";
  sortOrder?: "asc" | "desc";
}

/** 顧客一覧のレスポンス */
export interface ListCustomersResult {
  data: CustomerSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 一覧用の顧客概要 */
export interface CustomerSummary {
  id: number;
  companyName: string;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  updatedAt: Date;
}

/** 顧客詳細 */
export interface CustomerDetail {
  id: number;
  tenantId: number;
  companyName: string;
  companyNameKana: string | null;
  zipCode: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 顧客作成入力 */
export interface CreateCustomerInput {
  companyName: string;
  companyNameKana?: string | null;
  zipCode?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

/** 顧客更新入力（PATCH — 部分更新） */
export interface UpdateCustomerInput {
  companyName?: string;
  companyNameKana?: string | null;
  zipCode?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

/** service 呼び出し時の共通パラメータ */
export interface CustomerServiceContext {
  tenantId: TenantId;
  actorUserId: ActorUserId;
  actorRole: string;
}
