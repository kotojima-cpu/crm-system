/**
 * Worker RequestContext 構築
 *
 * worker が payload を処理する前に、RequestContext を安全に再構築する。
 * これにより worker 内でも logger / AuditLog が requestId, tenantId 等を
 * 自動注入できる。
 */

import type { RequestContext, TenantId } from "@/shared/types";
import { toTenantId } from "@/shared/types/helpers";
import { createRequestContextForWorker, runWithRequestContext } from "@/shared/context";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";
import type { WorkerExecutionPlan } from "./types";
import { WorkerTenantContextError } from "./errors";

/**
 * payload envelope から RequestContext を組み立てる。
 *
 * requestId を worker 側でも引き継ぐことで、
 * API → outbox → worker → external の requestId 一貫伝搬を実現する。
 */
export function buildWorkerRequestContext(
  envelope: OutboxEventPayloadEnvelope,
): RequestContext {
  return createRequestContextForWorker({
    requestId: envelope.requestId,
    executionContext: envelope.executionContext,
    tenantId: envelope.tenantId,
    actorUserId: envelope.actorUserId,
    actorRole: null, // worker では actorRole は null（system 代理実行）
  });
}

/**
 * RequestContext を設定してコールバックを実行する。
 *
 * worker の処理全体をこのラッパーで囲むことで、
 * 内部の logger / AuditLog が自動的にコンテキスト情報を注入する。
 */
export function runWorkerWithContext<T>(
  envelope: OutboxEventPayloadEnvelope,
  fn: () => T,
): T {
  const ctx = buildWorkerRequestContext(envelope);
  return runWithRequestContext(ctx, fn);
}

/**
 * payload envelope を見て、どの transaction wrapper を使うべきか決定する。
 *
 * ルール:
 *   executionContext = "tenant"   → withTenantTx(tenantId, ...)
 *   executionContext = "platform" → withPlatformTx(...)
 *   executionContext = "system"   → withSystemTx(...)
 *
 * tenant executionContext で tenantId が null の場合はエラー。
 */
export function resolveWorkerExecutionPlan(
  envelope: OutboxEventPayloadEnvelope,
): WorkerExecutionPlan {
  switch (envelope.executionContext) {
    case "tenant": {
      if (envelope.tenantId === null || envelope.tenantId === undefined) {
        throw new WorkerTenantContextError(
          `Tenant executionContext requires tenantId, but got null (jobType=${envelope.jobType})`,
        );
      }
      return {
        executionContext: "tenant",
        tenantId: toTenantId(envelope.tenantId as number),
      };
    }
    case "platform": {
      return {
        executionContext: "platform",
        targetTenantId: envelope.targetTenantId ?? null,
      };
    }
    case "system": {
      return { executionContext: "system" };
    }
    default: {
      throw new WorkerTenantContextError(
        `Unknown executionContext: ${envelope.executionContext}`,
      );
    }
  }
}
