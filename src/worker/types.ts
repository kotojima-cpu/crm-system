/**
 * Worker 型定義
 *
 * 設計書: tenant-auth-design.md §11, security-design.md §7
 *
 * 非同期処理 worker の共通型。
 * worker は outbox / queue / eventbus 由来のジョブを処理し、
 * tenant 文脈を再構築してから業務処理を実行する。
 */

import type { TxClient } from "@/shared/db";
import type {
  TenantId,
  ActorUserId,
  RequestId,
  ExecutionContext,
} from "@/shared/types";
import type { OutboxEventPayloadEnvelope, OutboxExecutionMode } from "@/outbox/types";

// --- Job Source ---

/** ジョブの発生源 */
export type WorkerJobSource =
  | "outbox"
  | "queue"
  | "eventbus"
  | "manual";

// --- Process Result ---

/** worker 処理結果 */
export type WorkerProcessResult =
  | { status: "sent" }
  | { status: "failed"; errorMessage: string; retryable: boolean }
  | { status: "dead"; errorMessage: string };

// --- Execution Plan ---

/**
 * worker がどの Tx wrapper で実行すべきかを表す。
 * payload の executionContext から決定する。
 */
export type WorkerExecutionPlan =
  | { executionContext: "tenant"; tenantId: TenantId }
  | { executionContext: "platform"; targetTenantId?: TenantId | null }
  | { executionContext: "system" };

// --- Parsed Job ---

/** parse 済みの worker ジョブ */
export interface ParsedWorkerJob {
  /** ジョブ発生源 */
  source: WorkerJobSource;
  /** イベント種別 */
  eventType: string;
  /** 実行方式 */
  executionMode: OutboxExecutionMode;
  /** 解析済み payload envelope */
  payloadEnvelope: OutboxEventPayloadEnvelope;
  /** 元の JSON 文字列 */
  rawPayloadJson: string;
  /** outbox レコード ID（outbox 起点の場合） */
  recordId: number | null;
  /** リトライ回数 */
  retryCount: number;
  /** リトライ上限 */
  maxRetries: number;
}

// --- Handler ---

/** worker handler の引数 */
export interface WorkerHandlerArgs {
  tx: TxClient;
  job: ParsedWorkerJob;
}

/**
 * worker handler 関数。
 *
 * handler は payload のみで処理を完結してはならない。
 * 必要な DB 再確認（レコード存在確認、tenant 所有権確認）を
 * 各 handler 内で実施すること。
 */
export type WorkerHandler = (
  args: WorkerHandlerArgs,
) => Promise<WorkerProcessResult>;

/** eventType → handler のマッピング */
export type WorkerHandlerMap = Map<string, WorkerHandler>;
