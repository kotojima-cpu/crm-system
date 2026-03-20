/**
 * EventBus 型定義
 */

import type { TenantAwareExternalPayload, TransportResult } from "../types";

/**
 * EventBus 送信入力。
 *
 * EventBridge の PutEvents に対応する構造。
 */
export interface EventBusPublishInput extends TenantAwareExternalPayload {
  /** イベントソース（例: "oa-saas.invoice"） */
  source: string;
  /** イベント詳細タイプ（例: "invoice.created"） */
  detailType: string;
  /** イベント詳細 */
  detail: Record<string, unknown>;
}

/** EventBus 送信結果 = TransportResult */
export type EventBusPublishResult = TransportResult;
