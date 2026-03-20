/**
 * Invoice feature 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** 請求一覧取得の入力 */
export interface ListInvoicesInput {
  tenantId: TenantId;
  page: number;
  limit: number;
  contractId?: number;
  status?: string;
}

/** 請求概要（一覧用） */
export interface InvoiceSummary {
  id: number;
  contractId: number;
  customerId: number;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: string;
}

/** 請求一覧レスポンス */
export interface ListInvoicesResult {
  data: InvoiceSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 請求詳細 */
export interface InvoiceDetail {
  id: number;
  tenantId: number;
  contractId: number;
  customerId: number;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: string;
  cancelReason: string | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 請求作成入力 */
export interface CreateInvoiceInput {
  contractId: number;
  periodStart: string; // ISO date
  periodEnd: string;
  amount: number;
}

/** 請求キャンセル入力 */
export interface CancelInvoiceInput {
  reason: string;
}

/** service 共通パラメータ */
export interface InvoiceServiceContext {
  tenantId: TenantId;
  actorUserId: ActorUserId;
  actorRole: string;
}

/** 請求ステータス */
export type InvoiceStatus = "draft" | "confirmed" | "cancelled";
