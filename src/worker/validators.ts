/**
 * Worker Payload Validator
 *
 * payload と DB 所有権の整合性を検証する。
 * RLS が有効でも、この検証は防御線として残すこと。
 */

import type { OutboxEventPayloadEnvelope } from "@/outbox/types";
import {
  WorkerPayloadValidationError,
  WorkerTenantContextError,
  WorkerOwnershipMismatchError,
} from "./errors";

/**
 * payload envelope の整合性を検証する。
 *
 * 確認項目:
 * - requestId が存在する
 * - executionContext が正しい
 * - tenant の場合 tenantId 必須
 * - jobType が存在する
 * - payload が object である
 */
export function validateWorkerPayloadEnvelope(
  envelope: OutboxEventPayloadEnvelope,
): void {
  if (!envelope.requestId) {
    throw new WorkerPayloadValidationError("envelope.requestId is required");
  }

  if (!["tenant", "platform", "system"].includes(envelope.executionContext)) {
    throw new WorkerPayloadValidationError(
      `Invalid executionContext: ${envelope.executionContext}`,
    );
  }

  // tenant executionContext では tenantId 必須
  if (envelope.executionContext === "tenant" && envelope.tenantId === null) {
    throw new WorkerTenantContextError(
      "Tenant executionContext requires tenantId, but got null",
    );
  }

  // platform executionContext で tenantId が設定されている場合は警告レベル
  // （platform_admin は tenantId を持たないのが正常）

  if (!envelope.jobType) {
    throw new WorkerPayloadValidationError("envelope.jobType is required");
  }

  if (!envelope.payload || typeof envelope.payload !== "object") {
    throw new WorkerPayloadValidationError(
      "envelope.payload must be a non-null object",
    );
  }
}

/**
 * payload の tenantId と DB レコードの tenantId を照合する。
 *
 * worker 内で DB レコードを取得した後に呼び出す。
 * 不一致は WorkerOwnershipMismatchError で即拒否する。
 *
 * RLS が将来有効でも、このチェックは第2防御線として残すこと。
 * （RLS は DB レベル、本チェックはアプリレベルの防御）
 */
export function assertWorkerTenantOwnership(options: {
  payloadTenantId: number | null;
  dbTenantId: number | null;
  eventType: string;
  resourceId: string | number | null;
}): void {
  // system / platform コンテキストでは tenantId 照合をスキップ
  // （payloadTenantId が null の場合）
  if (options.payloadTenantId === null) return;

  if (options.payloadTenantId !== options.dbTenantId) {
    throw new WorkerOwnershipMismatchError(
      options.payloadTenantId,
      options.dbTenantId,
      options.eventType,
      options.resourceId,
    );
  }
}

/**
 * executionContext と実行環境の整合性を確認する。
 *
 * 例: tenant context の payload を platform handler で処理しようとした場合のチェック。
 */
export function assertExecutionContextConsistency(
  payloadContext: string,
  expectedContext: string,
): void {
  if (payloadContext !== expectedContext) {
    throw new WorkerTenantContextError(
      `ExecutionContext mismatch: payload=${payloadContext}, expected=${expectedContext}`,
    );
  }
}
