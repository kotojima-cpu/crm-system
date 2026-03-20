/**
 * 月次請求バッチ 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** 月次請求生成の入力 */
export interface GenerateMonthlyInvoicesInput {
  tenantId?: number | null;
  targetMonth: string; // "2026-04" 形式
  dryRun?: boolean;
}

/** 対象月 */
export type BillingBatchTargetMonth = string; // "YYYY-MM"

/** 生成結果サマリー（1契約分） */
export interface GeneratedInvoiceSummary {
  contractId: number;
  invoiceId: number | null;
  created: boolean;
  skippedReason?: string;
}

/** 1 tenant の月次請求生成結果 */
export interface GenerateMonthlyInvoicesResult {
  tenantId: number | null;
  targetMonth: string;
  totalContracts: number;
  createdCount: number;
  skippedCount: number;
  summaries: GeneratedInvoiceSummary[];
}

/** 全 tenant 向けバッチ結果 */
export interface GenerateAllTenantsResult {
  targetMonth: string;
  totalTenants: number;
  successCount: number;
  failedCount: number;
  results: GenerateMonthlyInvoicesResult[];
  errors: { tenantId: number; error: string }[];
}

/** バッチ対象の契約情報 */
export interface BillableContract {
  id: number;
  tenantId: number;
  customerId: number;
  productName: string;
  contractStartDate: Date;
  contractEndDate: Date;
  monthlyFee: number | null;
  billingBaseDay: number | null;
  contractStatus: string;
}

/** service 共通パラメータ */
export interface BillingBatchServiceContext {
  tenantId: TenantId | null;
  actorUserId: ActorUserId;
  actorRole: string;
}
