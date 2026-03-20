/**
 * Outbox Payload Serializer
 *
 * payload を安全に JSON 変換し、tenant 文脈を envelope に統合する。
 * RequestContext からの自動補完を行い、機密情報をサニタイズする。
 */

import { getRequestContext } from "@/shared/context";
import type {
  RequestId,
  ExecutionContext,
} from "@/shared/types";
import type {
  OutboxEventPayloadEnvelope,
  WriteOutboxEventInput,
  ResolvedOutboxEventInput,
} from "./types";
import { OutboxValidationError, OutboxSerializationError } from "./errors";

// --- 機密キーパターン（logger / AuditLog と整合） ---

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

/** payload の最大サイズ（バイト）。超過でエラー。 */
const MAX_PAYLOAD_SIZE = 64_000;

/**
 * payload から機密キーを除外する。
 *
 * 再帰的にチェックし、機密キーの値を "[REDACTED]" に置換する。
 */
export function sanitizeOutboxPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeOutboxPayload(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * payload を JSON 文字列にシリアライズする。
 *
 * サイズ上限チェック・循環参照対策を含む。
 */
export function serializeOutboxPayload(
  envelope: OutboxEventPayloadEnvelope,
): string {
  let json: string;
  try {
    json = JSON.stringify(envelope);
  } catch {
    throw new OutboxSerializationError(
      "Failed to serialize outbox payload (circular reference or non-serializable value)",
    );
  }

  if (json.length > MAX_PAYLOAD_SIZE) {
    throw new OutboxSerializationError(
      `Outbox payload exceeds maximum size: ${json.length} > ${MAX_PAYLOAD_SIZE}`,
    );
  }

  return json;
}

/**
 * Outbox envelope を組み立てる。
 *
 * RequestContext が存在する場合は自動補完する。
 * RequestContext がない場合は、executionContext / requestId が
 * 明示されていなければエラーを投げる。
 */
export function buildOutboxEnvelope(
  input: WriteOutboxEventInput,
): OutboxEventPayloadEnvelope {
  const ctx = getRequestContext();

  // requestId の解決
  const requestId = input.requestId ?? ctx?.requestId;
  if (!requestId) {
    throw new OutboxValidationError(
      "Outbox: requestId is required. Set RequestContext or pass it explicitly.",
    );
  }

  // executionContext の解決
  const executionContext = input.executionContext ?? ctx?.executionContext;
  if (!executionContext) {
    throw new OutboxValidationError(
      "Outbox: executionContext is required. Set RequestContext or pass it explicitly.",
    );
  }

  // tenantId / actorUserId の解決
  const tenantId = input.tenantId ?? ctx?.tenantId ?? null;
  const actorUserId = input.actorUserId ?? ctx?.actorUserId ?? null;

  // payload のサニタイズ
  const sanitizedPayload = sanitizeOutboxPayload(input.payload);

  return {
    tenantId,
    actorUserId,
    executionContext,
    requestId,
    jobType: input.jobType,
    resourceId: input.resourceId,
    targetTenantId: input.targetTenantId ?? null,
    payload: sanitizedPayload,
  };
}

/**
 * WriteOutboxEventInput → ResolvedOutboxEventInput に変換する。
 *
 * envelope 組み立て + JSON シリアライズを一括で行う。
 */
export function resolveOutboxEventInput(
  input: WriteOutboxEventInput,
): ResolvedOutboxEventInput {
  const envelope = buildOutboxEnvelope(input);
  const payloadJson = serializeOutboxPayload(envelope);

  return {
    eventType: input.eventType,
    executionMode: input.executionMode,
    status: "pending",
    payloadEnvelope: envelope,
    payloadJson,
    availableAt: input.availableAt ?? new Date(),
    maxRetries: input.maxRetries ?? 3,
  };
}
