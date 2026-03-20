/**
 * 共通ドメイン型定義
 *
 * SaaS マルチテナント基盤で使用する共通型。
 * 全ての業務コード・基盤コードはこのファイルの型を参照する。
 */

// --- Branded Types ---

/** テナント ID（正の整数） */
export type TenantId = number & { readonly __brand: "TenantId" };

/** ユーザー ID（正の整数） */
export type ActorUserId = number & { readonly __brand: "ActorUserId" };

/** リクエスト ID（UUID v4） */
export type RequestId = string & { readonly __brand: "RequestId" };

// --- Execution Context ---

/** 実行コンテキスト */
export type ExecutionContext = "tenant" | "platform" | "system";

// --- Async Job ---

/** 非同期ジョブ payload 標準型 */
export interface AsyncJobPayload {
  tenantId: TenantId | null;
  actorUserId: ActorUserId | null;
  executionContext: ExecutionContext;
  requestId: RequestId;
  jobType: string;
  resourceId: string | number | null;
  targetTenantId?: TenantId | null;
}

// --- Outbox Event ---

/** Outbox イベントステータス */
export type OutboxEventStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "dead"
  | "cancelled";

/** Outbox イベント payload */
export interface OutboxEventPayload {
  type: string;
  tenantId: TenantId | null;
  payload: AsyncJobPayload;
  status: OutboxEventStatus;
}

// --- Audit Log Context ---

/** 監査ログに渡す tenant 文脈 */
export interface AuditTenantContext {
  requestedTenantId: TenantId | null;
  effectiveTenantId: TenantId | null;
  targetTenantId: TenantId | null;
}

/** 監査ログパラメータ */
export interface AuditLogParams extends AuditTenantContext {
  userId: ActorUserId | null;
  actorRole: string;
  executionContext: ExecutionContext;
  requestId: RequestId;
  action: string;
  tableName: string;
  recordId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  result: "success" | "denied";
}

// --- Session User ---

/** 認証済みユーザー情報 */
export interface SessionUser {
  id: ActorUserId;
  name: string;
  loginId: string;
  role: "platform_admin" | "tenant_admin" | "sales";
  tenantId: TenantId | null;
  tenantStatus: string | null;
  authVersion: number;
}

// --- Request Context ---

/** リクエストスコープの文脈情報 */
export interface RequestContext {
  requestId: RequestId;
  executionContext: ExecutionContext;
  tenantId: TenantId | null;
  actorUserId: ActorUserId | null;
  actorRole: string | null;
}
