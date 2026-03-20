/**
 * Worker Payload Parser
 *
 * outbox / queue / eventbus 由来の payload を共通的に解析し、
 * ParsedWorkerJob に変換する。
 */

import type { OutboxEventPayloadEnvelope } from "@/outbox/types";
import type { OutboxEventRecord } from "@/outbox/dispatcher";
import type { ParsedWorkerJob, WorkerJobSource } from "./types";
import { WorkerPayloadValidationError } from "./errors";

/**
 * JSON 文字列を OutboxEventPayloadEnvelope に parse する。
 *
 * 必須フィールドの存在確認を行い、欠落時はエラーを投げる。
 */
export function parsePayloadEnvelope(
  json: string,
): OutboxEventPayloadEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WorkerPayloadValidationError(
      `Invalid JSON payload: ${json.slice(0, 100)}...`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new WorkerPayloadValidationError(
      "Payload must be a JSON object",
    );
  }

  const obj = parsed as Record<string, unknown>;

  // 必須フィールドの存在確認
  if (!obj.requestId || typeof obj.requestId !== "string") {
    throw new WorkerPayloadValidationError(
      "Payload missing required field: requestId",
    );
  }

  if (!obj.executionContext || typeof obj.executionContext !== "string") {
    throw new WorkerPayloadValidationError(
      "Payload missing required field: executionContext",
    );
  }

  if (!["tenant", "platform", "system"].includes(obj.executionContext as string)) {
    throw new WorkerPayloadValidationError(
      `Invalid executionContext: ${obj.executionContext}`,
    );
  }

  if (!obj.jobType || typeof obj.jobType !== "string") {
    throw new WorkerPayloadValidationError(
      "Payload missing required field: jobType",
    );
  }

  if (!obj.payload || typeof obj.payload !== "object") {
    throw new WorkerPayloadValidationError(
      "Payload missing required field: payload (must be object)",
    );
  }

  // resourceId は null 許容だが存在は必須
  if (!("resourceId" in obj)) {
    throw new WorkerPayloadValidationError(
      "Payload missing required field: resourceId",
    );
  }

  return parsed as OutboxEventPayloadEnvelope;
}

/**
 * outbox レコードから ParsedWorkerJob を生成する。
 */
export function parseOutboxRecord(record: OutboxEventRecord): ParsedWorkerJob {
  const envelope = parsePayloadEnvelope(record.payloadJson);

  return {
    source: "outbox",
    eventType: record.eventType,
    executionMode: record.executionMode as ParsedWorkerJob["executionMode"],
    payloadEnvelope: envelope,
    rawPayloadJson: record.payloadJson,
    recordId: record.id,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
  };
}

/**
 * raw queue message から ParsedWorkerJob を生成する。
 *
 * queue message は JSON 文字列 + メタデータの想定。
 */
export function parseQueueMessage(
  messageBody: string,
  options?: {
    source?: WorkerJobSource;
    eventType?: string;
    executionMode?: ParsedWorkerJob["executionMode"];
    retryCount?: number;
    maxRetries?: number;
  },
): ParsedWorkerJob {
  const envelope = parsePayloadEnvelope(messageBody);

  return {
    source: options?.source ?? "queue",
    eventType: options?.eventType ?? envelope.jobType,
    executionMode: options?.executionMode ?? "queue",
    payloadEnvelope: envelope,
    rawPayloadJson: messageBody,
    recordId: null,
    retryCount: options?.retryCount ?? 0,
    maxRetries: options?.maxRetries ?? 3,
  };
}

/**
 * 汎用 parse。入力が string なら JSON parse、object ならそのまま使う。
 */
export function parseWorkerJob(
  input: string | OutboxEventRecord | Record<string, unknown>,
  options?: {
    source?: WorkerJobSource;
    eventType?: string;
    executionMode?: ParsedWorkerJob["executionMode"];
    retryCount?: number;
    maxRetries?: number;
  },
): ParsedWorkerJob {
  // OutboxEventRecord の場合
  if (
    typeof input === "object" &&
    "payloadJson" in input &&
    "eventType" in input &&
    "status" in input
  ) {
    return parseOutboxRecord(input as OutboxEventRecord);
  }

  // JSON string の場合
  if (typeof input === "string") {
    return parseQueueMessage(input, options);
  }

  // 既に object 化された payload の場合
  const json = JSON.stringify(input);
  return parseQueueMessage(json, options);
}
