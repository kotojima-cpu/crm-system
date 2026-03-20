/**
 * Contract feature 型定義
 */

import type { TenantId, ActorUserId } from "@/shared/types";

/** 契約一覧取得の入力 */
export interface ListContractsInput {
  tenantId: TenantId;
  page: number;
  limit: number;
  customerId?: number;
  status?: string;
}

/** 契約概要（一覧用） */
export interface ContractSummary {
  id: number;
  customerId: number;
  contractNumber: string | null;
  productName: string;
  contractStartDate: Date;
  contractEndDate: Date;
  contractStatus: string;
  monthlyFee: number | null;
}

/** 契約一覧レスポンス */
export interface ListContractsResult {
  data: ContractSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 契約詳細 */
export interface ContractDetail {
  id: number;
  tenantId: number;
  customerId: number;
  contractNumber: string | null;
  productName: string;
  leaseCompanyName: string | null;
  contractStartDate: Date;
  contractEndDate: Date;
  contractMonths: number;
  monthlyFee: number | null;
  counterBaseFee: unknown;
  monoCounterRate: unknown;
  colorCounterRate: unknown;
  billingBaseDay: number | null;
  contractStatus: string;
  notes: string | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 契約作成入力 */
export interface CreateContractInput {
  customerId: number;
  contractNumber?: string | null;
  productName: string;
  leaseCompanyName?: string | null;
  contractStartDate: string; // ISO date
  contractEndDate: string;
  contractMonths: number;
  monthlyFee?: number | null;
  counterBaseFee?: number | null;
  monoCounterRate?: number | null;
  colorCounterRate?: number | null;
  billingBaseDay?: number | null;
  notes?: string | null;
}

/** 契約更新入力 */
export interface UpdateContractInput {
  contractNumber?: string | null;
  productName?: string;
  leaseCompanyName?: string | null;
  monthlyFee?: number | null;
  counterBaseFee?: number | null;
  monoCounterRate?: number | null;
  colorCounterRate?: number | null;
  billingBaseDay?: number | null;
  contractStatus?: string;
  notes?: string | null;
}

/** service 共通パラメータ */
export interface ContractServiceContext {
  tenantId: TenantId;
  actorUserId: ActorUserId;
  actorRole: string;
}
