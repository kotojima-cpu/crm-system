/**
 * Outbox 型定義
 *
 * 設計書: tenant-auth-design.md §11, security-design.md §7
 *
 * Outbox パターンの型定義。transaction 内で外部副作用を直接実行せず、
 * outbox テーブルに「処理予約」を記録し、transaction commit 後に
 * worker / dispatcher が処理する。
 *
 * ┌─ 禁止事項 ─────────────────────────────────────────────────────────┐
 * │ transaction 内で以下を実行してはならない:                          │
 * │   - email send                                                      │
 * │   - webhook call                                                    │
 * │   - queue publish                                                   │
 * │   - external API call                                               │
 * │                                                                      │
 * │ transaction 内で許可:                                               │
 * │   - DB 更新                                                         │
 * │   - AuditLog 記録                                                   │
 * │   - Outbox event 作成                                               │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import type {
  TenantId,
  ActorUserId,
  RequestId,
  ExecutionContext,
} from "@/shared/types";

// --- Outbox Status ---

/** Outbox イベントのライフサイクルステータス */
export type OutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "dead";

// --- Execution Mode ---

/** 外部副作用の実行方式 */
export type OutboxExecutionMode =
  | "queue"
  | "webhook"
  | "email"
  | "eventbus"
  | "internal";

// --- Event Type ---

/**
 * Outbox イベント種別。
 * "domain.action" 形式の文字列。
 * events.ts の定数を使用し、文字列を直接ばらまかないこと。
 */
export type OutboxEventType = string;

// --- Payload Envelope ---

/**
 * Outbox payload の envelope 構造。
 *
 * ┌─ ID 単体 payload 禁止 ─────────────────────────────────────────────┐
 * │ payload に { invoiceId: 123 } のような ID 単体を入れてはならない。  │
 * │ worker 側で tenant context を再構築するために、必ず envelope の      │
 * │ tenant 文脈フィールド（tenantId, actorUserId, executionContext,     │
 * │ requestId）を使用すること。                                         │
 * │                                                                      │
 * │ payload 内には処理に必要な業務データを含める:                        │
 * │   良い例: { invoiceId: 123, tenantName: "...", amount: 10000 }     │
 * │   悪い例: { invoiceId: 123 }  ← tenant 文脈なしで処理不能          │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export interface OutboxEventPayloadEnvelope {
  /** テナント ID（tenant/system は JWT tenantId、platform は操作対象） */
  tenantId: TenantId | null;
  /** 操作者ユーザー ID */
  actorUserId: ActorUserId | null;
  /** 実行コンテキスト */
  executionContext: ExecutionContext;
  /** リクエスト ID（API → outbox → worker で一貫伝搬） */
  requestId: RequestId;
  /** ジョブ種別（eventType と同一か、より詳細な分類） */
  jobType: string;
  /** 対象リソース ID */
  resourceId: string | number | null;
  /** クロステナント操作の対象テナント ID */
  targetTenantId?: TenantId | null;
  /** 業務データ payload */
  payload: Record<string, unknown>;
}

// --- Writer Input ---

/**
 * writeOutboxEvent に渡す入力型。
 *
 * RequestContext から自動補完されるフィールドと、
 * 呼び出し側が明示的に渡すフィールドを区別する。
 */
export interface WriteOutboxEventInput {
  // --- イベント識別 ---
  /** イベント種別（"invoice.created" 等） */
  eventType: OutboxEventType;
  /** 実行方式 */
  executionMode: OutboxExecutionMode;

  // --- RequestContext から自動補完可能 ---
  /** リクエスト ID。省略時は RequestContext から取得。 */
  requestId?: RequestId;
  /** 操作者ユーザー ID。省略時は RequestContext から取得。 */
  actorUserId?: ActorUserId | null;
  /** 実行コンテキスト。省略時は RequestContext から取得。 */
  executionContext?: ExecutionContext;
  /** テナント ID。省略時は RequestContext から取得。 */
  tenantId?: TenantId | null;

  // --- 必須フィールド ---
  /** ジョブ種別 */
  jobType: string;
  /** 対象リソース ID */
  resourceId: string | number | null;
  /** 業務データ payload */
  payload: Record<string, unknown>;

  // --- 任意フィールド ---
  /** クロステナント操作の対象テナント ID */
  targetTenantId?: TenantId | null;
  /** 処理予約日時（遅延実行用）。省略時は即時。 */
  availableAt?: Date;
  /** 最大リトライ回数。省略時は 3。 */
  maxRetries?: number;
}

/**
 * RequestContext 補完後の確定済み入力型。
 * writeOutboxEvent 内部で使用する。
 */
export interface ResolvedOutboxEventInput {
  eventType: OutboxEventType;
  executionMode: OutboxExecutionMode;
  status: "pending";
  payloadEnvelope: OutboxEventPayloadEnvelope;
  payloadJson: string;
  availableAt: Date;
  maxRetries: number;
}

// --- Poll ---

/** poller が取得する対象条件 */
export interface PollOutboxEventsInput {
  /** 一度に取得する最大件数（デフォルト 50） */
  limit?: number;
  /** 対象 executionMode を絞り込む（省略時は全モード） */
  executionMode?: OutboxExecutionMode;
}

/** poll サイクルの実行結果サマリー */
export interface OutboxPollerSummary {
  polledCount: number;
  sentCount: number;
  failedCount: number;
  deadCount: number;
  skippedCount: number;
  errors: string[];
}

// --- Replay ---

/** dead/failed event の手動再実行入力 */
export interface ReplayOutboxEventInput {
  /** 再実行対象の outbox event ID */
  eventId: number;
  /** sent を強制 replay する場合は true（通常は禁止） */
  forceSentReplay?: boolean;
}
