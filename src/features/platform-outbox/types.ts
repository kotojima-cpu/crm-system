import type { OutboxPollerSummary, PollOutboxEventsInput } from "@/outbox/types";

export interface PollCycleInput extends PollOutboxEventsInput {
  /** worker handler を使って同プロセス内で即時処理するか */
  immediate?: boolean;
}

export interface PollCycleResult {
  summary: OutboxPollerSummary;
}

export interface RetryEventInput {
  eventId: number;
}

/** 一覧・詳細共通の基本ビュー */
export interface OutboxEventView {
  id: number;
  eventType: string;
  executionMode: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  availableAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 一覧取得フィルター */
export interface ListOutboxEventsFilter {
  /** ステータス絞り込み（複数指定可） */
  status?: string | string[];
  /** イベント種別 */
  eventType?: string;
  /** 実行モード */
  executionMode?: string;
  /** 作成日時（開始） */
  fromCreatedAt?: Date;
  /** 作成日時（終了） */
  toCreatedAt?: Date;
}

/** ページネーション */
export interface ListOutboxEventsPagination {
  limit?: number;
  offset?: number;
}

/** 一覧アイテム（payloadEnvelope から安全に抽出したフィールドを含む） */
export interface OutboxEventListItem extends OutboxEventView {
  requestId?: string | null;
  tenantId?: number | null;
  resourceId?: number | null;
  jobType?: string | null;
}

/** 詳細ビュー（マスク済み payload を含む） */
export interface OutboxEventDetail extends OutboxEventListItem {
  /** 機密キーをマスクした payload 表示用オブジェクト */
  maskedPayload: Record<string, unknown>;
}

/** summary 集計結果 */
export interface OutboxSummary {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  deadCount: number;
  sentCount: number;
  /** failed のうち maxRetries 未達のもの（まだ自動リトライ可） */
  retryableFailedCount: number;
  /** 15分以上 processing のまま止まっているイベント数 */
  stuckProcessingCount: number;
  /** stuck かつ recovery 可能なイベント数 */
  recoverableStuckCount: number;
  /** 最古の pending イベントの createdAt */
  oldestPendingCreatedAt: Date | null;
  /** 最古の failed イベントの createdAt */
  oldestFailedCreatedAt: Date | null;
  /** 直近の failed/dead イベントのエラーサンプル（最大5件） */
  recentErrorSamples: Array<{ id: number; eventType: string; lastError: string }>;
}

/** 運用アラート */
export type OutboxOperationalAlert =
  | { level: "warning"; code: "DEAD_EVENTS_EXIST"; count: number }
  | { level: "warning"; code: "STUCK_PROCESSING"; count: number }
  | { level: "warning"; code: "FAILED_EVENTS_HIGH"; count: number };

/** health check 結果 */
export interface OutboxHealthCheckResult {
  summary: OutboxSummary;
  alerts: OutboxOperationalAlert[];
  metricsPublished: boolean;
  notificationsSent: boolean;
  notificationReasons: string[];
  status: "healthy" | "warning" | "critical";
  suppressedByCooldown: boolean;
}
