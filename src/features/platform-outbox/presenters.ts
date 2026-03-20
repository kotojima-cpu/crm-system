/**
 * platform-outbox プレゼンター
 *
 * - DB レコードや raw payload を UI/API レスポンス用に変換する
 * - 機密情報のマスク
 * - 操作可否判定
 * - ステータスラベル整形
 *
 * UI 層・API 層は DB record や payloadJson を直接扱わず、
 * ここで変換したオブジェクトを使うこと。
 */

import type { OutboxEventListItem, OutboxEventDetail } from "./types";

// --- 機密キーセット ---

const SENSITIVE_KEYS = new Set([
  "secretApiKey",
  "apiKey",
  "secret",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "auth",
  "privateKey",
  "webhookSecret",
  "smtpPassword",
]);

/**
 * 再帰的に機密キーを [REDACTED] に置換する。
 * payload 全文の無制限露出を防ぐ。
 */
function redactSensitiveKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveKeys);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redactSensitiveKeys(v);
  }
  return result;
}

/**
 * payloadJson を安全にパースし、機密キーをマスクして返す。
 *
 * パース失敗時は { _parseError: true } を返す。
 */
export function maskOutboxPayloadForDisplay(
  payloadJson: string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payloadJson);
    return redactSensitiveKeys(parsed) as Record<string, unknown>;
  } catch {
    return { _parseError: true, _raw: payloadJson.slice(0, 200) };
  }
}

/**
 * payloadJson から envelope フィールドを安全に抽出する。
 * 失敗時は空オブジェクトを返す（エラーを投げない）。
 */
export function extractEnvelopeFields(payloadJson: string): {
  requestId?: string | null;
  tenantId?: number | null;
  resourceId?: number | null;
  jobType?: string | null;
} {
  try {
    const parsed = JSON.parse(payloadJson);
    if (typeof parsed !== "object" || parsed === null) return {};
    return {
      requestId: typeof parsed.requestId === "string" ? parsed.requestId : null,
      tenantId: typeof parsed.tenantId === "number" ? parsed.tenantId : null,
      resourceId:
        typeof parsed.resourceId === "number" ? parsed.resourceId : null,
      jobType: typeof parsed.jobType === "string" ? parsed.jobType : null,
    };
  } catch {
    return {};
  }
}

/** ステータスを日本語ラベルに変換する */
export function formatOutboxStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待機中",
    processing: "処理中",
    sent: "送信済",
    failed: "失敗",
    dead: "停止（要対応）",
  };
  return labels[status] ?? status;
}

/** retry ボタンを表示してよいか（failed のみ） */
export function isOutboxRetryAllowed(status: string): boolean {
  return status === "failed";
}

/** replay ボタンを表示してよいか（dead のみ） */
export function isOutboxReplayAllowed(status: string): boolean {
  return status === "dead";
}

/**
 * force replay ボタンを表示してよいか（sent のみ）。
 * 危険操作のため、通常 retry とは別導線で扱うこと。
 */
export function isOutboxForceReplayAllowed(status: string): boolean {
  return status === "sent";
}

/**
 * DB レコード + payloadJson から一覧アイテムを組み立てる。
 */
export function buildOutboxListItem(
  r: {
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
    payloadJson: string;
  },
): OutboxEventListItem {
  const envelope = extractEnvelopeFields(r.payloadJson);
  return {
    id: r.id,
    eventType: r.eventType,
    executionMode: r.executionMode,
    status: r.status,
    retryCount: r.retryCount,
    maxRetries: r.maxRetries,
    lastError: r.lastError,
    availableAt: r.availableAt,
    processedAt: r.processedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    requestId: envelope.requestId,
    tenantId: envelope.tenantId,
    resourceId: envelope.resourceId,
    jobType: envelope.jobType,
  };
}

/**
 * DB レコード + payloadJson から詳細ビューを組み立てる。
 */
export function buildOutboxDetailView(
  r: {
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
    payloadJson: string;
  },
): OutboxEventDetail {
  const listItem = buildOutboxListItem(r);
  return {
    ...listItem,
    maskedPayload: maskOutboxPayloadForDisplay(r.payloadJson),
  };
}
