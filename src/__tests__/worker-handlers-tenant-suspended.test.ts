import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
}));

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockWebhook = { dispatch: vi.fn() };

vi.mock("@/infrastructure", () => ({
  createMailer: vi.fn(),
  createWebhookDispatcher: () => mockWebhook,
  createQueuePublisher: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn(),
  withPlatformTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

const { handleTenantSuspended } = await import(
  "@/worker/handlers/tenant-suspended"
);

import type { ParsedWorkerJob } from "@/worker/types";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";

function makeJob(
  payload: Record<string, unknown>,
  tenantId: number | null = null,
) {
  const envelope: OutboxEventPayloadEnvelope = {
    tenantId: tenantId as never,
    actorUserId: 99 as never,
    executionContext: "platform",
    requestId: "req-worker-001" as never,
    jobType: "tenant.suspended",
    resourceId: payload.tenantId as number,
    payload,
  };

  const tx: Record<string, unknown> = {
    tenant: { findFirst: vi.fn() },
  };

  const job: ParsedWorkerJob = {
    source: "outbox",
    eventType: "tenant.suspended",
    executionMode: "webhook",
    payloadEnvelope: envelope,
    rawPayloadJson: JSON.stringify(envelope),
    recordId: 1,
    retryCount: 0,
    maxRetries: 3,
  };

  return { tx, job };
}

describe("handleTenantSuspended", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tenant 状態再確認後に webhook dispatch する", async () => {
    const { tx, job } = makeJob({ tenantId: 1 });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 1, name: "テストテナント", status: "suspended",
      updatedAt: new Date("2026-03-16T00:00:00Z"),
    });
    mockWebhook.dispatch.mockResolvedValue({ ok: true });

    const result = await handleTenantSuspended({ tx: tx as never, job });
    expect(result.status).toBe("sent");
    expect(mockWebhook.dispatch).toHaveBeenCalledOnce();
    expect(mockWebhook.dispatch.mock.calls[0][0].eventType).toBe(
      "tenant.suspended",
    );
  });

  it("suspended でない tenant は dead", async () => {
    const { tx, job } = makeJob({ tenantId: 1 });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 1, name: "テスト", status: "active", updatedAt: new Date(),
    });

    const result = await handleTenantSuspended({ tx: tx as never, job });
    expect(result.status).toBe("dead");
    expect(mockWebhook.dispatch).not.toHaveBeenCalled();
  });

  it("tenant が見つからない場合は dead", async () => {
    const { tx, job } = makeJob({ tenantId: 999 });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue(null);

    const result = await handleTenantSuspended({ tx: tx as never, job });
    expect(result.status).toBe("dead");
  });

  it("webhook blocked（allowlist）は dry-run 扱い", async () => {
    const { tx, job } = makeJob({ tenantId: 1 });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 1, name: "テスト", status: "suspended", updatedAt: new Date(),
    });
    mockWebhook.dispatch.mockResolvedValue({ ok: true, dryRun: true, blocked: true });

    const result = await handleTenantSuspended({ tx: tx as never, job });
    expect(result.status).toBe("sent");
  });

  it("5xx 相当は retryable", async () => {
    const { tx, job } = makeJob({ tenantId: 1 });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 1, name: "テスト", status: "suspended", updatedAt: new Date(),
    });
    mockWebhook.dispatch.mockResolvedValue({
      ok: false, errorMessage: "502 Bad Gateway", retryable: true,
    });

    const result = await handleTenantSuspended({ tx: tx as never, job });
    expect(result.status).toBe("failed");
    expect((result as { retryable: boolean }).retryable).toBe(true);
  });
});
