/**
 * Webhook 型定義
 */

import type { TenantAwareExternalPayload, TransportResult } from "../types";

/**
 * Webhook 送信入力。
 *
 * tenantId / requestId を body または header に含められる構造にする。
 */
export interface WebhookDispatchInput extends TenantAwareExternalPayload {
  /** 送信先 URL */
  endpoint: string;
  /** イベント種別 */
  eventType: string;
  /** リクエストボディ */
  body: Record<string, unknown>;
  /** 送信者 ID */
  actorUserId: number | null;
  /** カスタムヘッダー */
  headers?: Record<string, string>;
}

/** Webhook 送信結果 = TransportResult */
export type WebhookDispatchResult = TransportResult;
