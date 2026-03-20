/**
 * AuditLog ヘルパー
 *
 * tenantId 解決・metadata サニタイズ等の補助関数。
 */

import type { TenantId, ExecutionContext } from "@/shared/types";

// --- Tenant ID 解決 ---

/**
 * effectiveTenantId を解決する。
 *
 * tenant コンテキスト → JWT tenantId がそのまま effective。
 * platform コンテキスト → 明示的に渡された targetTenantId を使う。
 * system コンテキスト → null。
 */
export function resolveEffectiveTenantId(options: {
  executionContext: ExecutionContext;
  jwtTenantId: TenantId | null;
  targetTenantId?: TenantId | null;
}): TenantId | null {
  switch (options.executionContext) {
    case "tenant":
      return options.jwtTenantId;
    case "platform":
      return options.targetTenantId ?? null;
    case "system":
      return null;
  }
}

/**
 * targetTenantId を解決する。
 *
 * platform コンテキストでのクロステナント操作でのみ設定される。
 * tenant/system コンテキストでは常に null。
 */
export function resolveTargetTenantId(options: {
  executionContext: ExecutionContext;
  targetTenantId?: TenantId | null;
}): TenantId | null {
  if (options.executionContext === "platform") {
    return options.targetTenantId ?? null;
  }
  return null;
}

// --- Metadata サニタイズ ---

/**
 * metadata から機密情報キーを除外する。
 *
 * logger.ts の SENSITIVE_FIELD_PATTERNS と整合する基準。
 * 監査ログ metadata にも機密情報を含めてはならない。
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apiKey/i,
  /authorization/i,
  /cookie/i,
  /creditCard/i,
  /recoveryCode/i,
];

/** metadata の最大サイズ（バイト）。超過分は切り捨てる */
const MAX_METADATA_SIZE = 10_000;

/**
 * 監査ログ metadata をサニタイズする。
 *
 * 1. 機密キーを "[REDACTED]" に置換
 * 2. 循環参照を除去（JSON.stringify のエラーハンドリング）
 * 3. サイズ上限を超過した場合は切り捨て
 *
 * @returns サニタイズ済みの JSON 文字列、または null
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  try {
    const json = JSON.stringify(sanitized);
    if (json.length > MAX_METADATA_SIZE) {
      return JSON.stringify({
        _truncated: true,
        _originalSize: json.length,
        ...JSON.parse(json.slice(0, MAX_METADATA_SIZE)),
      }).slice(0, MAX_METADATA_SIZE);
    }
    return json;
  } catch {
    // 循環参照等
    return JSON.stringify({ _error: "Failed to serialize metadata" });
  }
}

/**
 * Record を JSON 文字列に安全に変換する。
 * oldValues / newValues 用。
 */
export function safeJsonStringify(
  values: Record<string, unknown> | undefined | null,
): string | null {
  if (!values || Object.keys(values).length === 0) return null;

  // 機密キーをサニタイズ
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  try {
    return JSON.stringify(sanitized);
  } catch {
    return JSON.stringify({ _error: "Failed to serialize values" });
  }
}
