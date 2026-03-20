/**
 * AuditLog 型定義
 *
 * 設計書: security-design.md §9, tenant-auth-design.md §5.4
 *
 * 業務監査ログの型。CloudWatch Logs（アプリログ）とは役割が異なる。
 * AuditLog は「誰が・どの tenant に・何をしたか」を DB に記録し、
 * 業務監査・コンプライアンス用途に使う。
 */

import type {
  TenantId,
  ActorUserId,
  RequestId,
  ExecutionContext,
} from "@/shared/types";

// --- Action / Resource / Result ---

/** 監査対象の操作種別 */
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "read"
  | "login"
  | "logout"
  | "invite"
  | "suspend"
  | "resume"
  | "confirm"
  | "cancel"
  | "retry"
  | "replay"
  | "poll"
  | "recover"
  | "health_check"
  | "suppress";

/** 監査対象のリソース種別 */
export type AuditResourceType =
  | "tenant"
  | "user"
  | "customer"
  | "contract"
  | "invoice"
  | "auth"
  | "system"
  | "outbox_event";

/** 監査結果 */
export type AuditResult = "success" | "failure";

// --- Writer Input ---

/**
 * writeAuditLog に渡す入力型。
 *
 * RequestContext から自動補完されるフィールドと、
 * 呼び出し側が明示的に渡すフィールドを区別する。
 */
export interface WriteAuditLogInput {
  // --- RequestContext から自動補完可能（省略時は RequestContext から取得） ---
  /** リクエスト ID。省略時は RequestContext から取得。 */
  requestId?: RequestId;
  /** 操作者ユーザー ID。省略時は RequestContext から取得。 */
  actorUserId?: ActorUserId | null;
  /** 操作者ロール。省略時は RequestContext から取得。 */
  actorRole?: string | null;
  /** 実行コンテキスト。省略時は RequestContext から取得。 */
  executionContext?: ExecutionContext;

  // --- Tenant 文脈 ---
  /**
   * リクエスト元の tenantId。
   * tenant API → JWT の tenantId。
   * platform API → null（明示リクエストでない場合）。
   */
  requestedTenantId?: TenantId | null;
  /**
   * 実効 tenantId。
   * tenant API → JWT tenantId と同一。
   * platform API → 操作対象テナントの ID。
   */
  effectiveTenantId?: TenantId | null;
  /**
   * クロステナント操作の対象 tenantId。
   * platform_admin がテナントを操作する場合に設定。
   */
  targetTenantId?: TenantId | null;

  // --- 必須フィールド ---
  /** リソース種別 */
  resourceType: AuditResourceType;
  /** 操作種別 */
  action: AuditAction;
  /** 対象レコード ID */
  recordId?: number | null;
  /** 操作結果 */
  result: AuditResult;

  // --- 任意フィールド ---
  /** 操作の説明メッセージ */
  message?: string;
  /** 変更前の値（JSON 文字列として保存） */
  oldValues?: Record<string, unknown>;
  /** 変更後の値（JSON 文字列として保存） */
  newValues?: Record<string, unknown>;
  /** 追加メタデータ（JSON 文字列として保存） */
  metadata?: Record<string, unknown>;
  /** クライアント IP アドレス */
  ipAddress?: string;
  /** User-Agent */
  userAgent?: string;
  /** リクエストパス */
  requestPath?: string;
}

/**
 * RequestContext 補完後の確定済み入力型。
 * writeAuditLog 内部で使用する。
 */
export interface ResolvedAuditLogInput {
  requestId: RequestId;
  actorUserId: ActorUserId | null;
  actorRole: string;
  executionContext: ExecutionContext;
  requestedTenantId: TenantId | null;
  effectiveTenantId: TenantId | null;
  targetTenantId: TenantId | null;
  resourceType: AuditResourceType;
  action: AuditAction;
  recordId: number | null;
  result: AuditResult;
  message: string | null;
  oldValues: string | null;
  newValues: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestPath: string | null;
}
