/**
 * tenant.suspended Worker Handler
 *
 * テナント停止時の外部通知。
 * DB 再確認 → suspended 確認 → WebhookDispatcher 送信。
 */

import { createWebhookDispatcher } from "@/infrastructure";
import type { WorkerHandlerArgs, WorkerProcessResult } from "../types";

/** webhook 通知先（環境変数 or デフォルト） */
function getTenantSuspendedWebhookUrl(): string {
  return (
    process.env.TENANT_SUSPENDED_WEBHOOK_URL ??
    "https://hooks.example.com/tenant-suspended"
  );
}

export async function handleTenantSuspended({
  tx,
  job,
}: WorkerHandlerArgs): Promise<WorkerProcessResult> {
  const { payload, tenantId, actorUserId, requestId, executionContext } =
    job.payloadEnvelope;

  const targetTenantId = (payload.tenantId as number) ?? tenantId;
  if (!targetTenantId) {
    return { status: "dead", errorMessage: "payload.tenantId is missing" };
  }

  // 1. DB 再確認
  const tenant = await tx.tenant.findFirst({
    where: { id: targetTenantId as number },
  });
  if (!tenant) {
    return {
      status: "dead",
      errorMessage: `Tenant ${targetTenantId} not found`,
    };
  }

  // suspended であることを確認
  if (tenant.status !== "suspended") {
    return {
      status: "dead",
      errorMessage: `Tenant ${targetTenantId} is not suspended (status: ${tenant.status})`,
    };
  }

  // 2. WebhookDispatcher 送信
  const webhook = createWebhookDispatcher();
  const result = await webhook.dispatch({
    endpoint: getTenantSuspendedWebhookUrl(),
    eventType: "tenant.suspended",
    body: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      suspendedAt: tenant.updatedAt.toISOString(),
    },
    tenantId: tenantId as number | null,
    actorUserId: actorUserId as number | null,
    requestId: requestId as string,
    executionContext,
  });

  if (!result.ok) {
    return {
      status: "failed",
      errorMessage: result.errorMessage,
      retryable: result.retryable,
    };
  }

  return { status: "sent" };
}
