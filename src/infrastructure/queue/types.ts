/**
 * Queue 型定義
 */

import type { TenantAwareExternalPayload, TransportResult } from "../types";

/**
 * Queue 送信入力。
 *
 * payloadJson は outbox の serialize 済み envelope を想定。
 * FIFO 対応の deduplicationKey / orderingKey も受け付ける。
 */
export interface QueuePublishInput extends TenantAwareExternalPayload {
  /** イベント種別 */
  eventType: string;
  /** 実行方式（queue 固定） */
  executionMode: "queue";
  /** serialize 済み payload JSON */
  payloadJson: string;
  /** FIFO 重複排除キー */
  deduplicationKey?: string;
  /** FIFO 順序キー（messageGroupId 相当） */
  orderingKey?: string;
}

/** Queue 送信結果 = TransportResult */
export type QueuePublishResult = TransportResult;
