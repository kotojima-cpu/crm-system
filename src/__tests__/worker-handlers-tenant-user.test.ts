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

const mockMailer = { send: vi.fn() };

vi.mock("@/infrastructure", () => ({
  createMailer: () => mockMailer,
  createWebhookDispatcher: vi.fn(),
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

const { handleTenantUserInviteRequested } = await import(
  "@/worker/handlers/tenant-user-invite-requested"
);

import type { ParsedWorkerJob } from "@/worker/types";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";

function makeJob(
  payload: Record<string, unknown>,
  tenantId: number | null = 1,
) {
  const envelope: OutboxEventPayloadEnvelope = {
    tenantId: tenantId as never,
    actorUserId: 10 as never,
    executionContext: "tenant",
    requestId: "req-worker-001" as never,
    jobType: "tenant-user.invite.requested",
    resourceId: payload.invitationId as number,
    payload,
  };

  const tx: Record<string, unknown> = {
    tenantUserInvitation: { findFirst: vi.fn() },
    tenant: { findFirst: vi.fn() },
  };

  const job: ParsedWorkerJob = {
    source: "outbox",
    eventType: "tenant-user.invite.requested",
    executionMode: "email",
    payloadEnvelope: envelope,
    rawPayloadJson: JSON.stringify(envelope),
    recordId: 1,
    retryCount: 0,
    maxRetries: 3,
  };

  return { tx, job };
}

const futureDate = new Date(Date.now() + 7 * 86400000);
const pastDate = new Date(Date.now() - 86400000);

describe("handleTenantUserInviteRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invitation 再確認後に送信する", async () => {
    const { tx, job } = makeJob({ invitationId: 5 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 5, tenantId: 1, email: "invite@example.com",
      status: "pending", token: "abc-token", expiresAt: futureDate,
    });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      name: "テストテナント",
    });
    mockMailer.send.mockResolvedValue({ ok: true });

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("sent");
    expect(mockMailer.send).toHaveBeenCalledOnce();
    expect(mockMailer.send.mock.calls[0][0].to).toBe("invite@example.com");
  });

  it("expired invitation は送信しない", async () => {
    const { tx, job } = makeJob({ invitationId: 5 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 5, tenantId: 1, email: "invite@example.com",
      status: "pending", token: "abc-token", expiresAt: pastDate,
    });

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("dead");
    expect(mockMailer.send).not.toHaveBeenCalled();
  });

  it("accepted invitation は送信不要（sent 扱い）", async () => {
    const { tx, job } = makeJob({ invitationId: 5 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 5, tenantId: 1, email: "invite@example.com",
      status: "accepted", token: "abc-token", expiresAt: futureDate,
    });

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("sent");
    expect(mockMailer.send).not.toHaveBeenCalled();
  });

  it("cancelled invitation は dead", async () => {
    const { tx, job } = makeJob({ invitationId: 5 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 5, tenantId: 1, email: "invite@example.com",
      status: "cancelled", token: "abc-token", expiresAt: futureDate,
    });

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("dead");
  });

  it("mailer failure を retryable で返す", async () => {
    const { tx, job } = makeJob({ invitationId: 5 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 5, tenantId: 1, email: "invite@example.com",
      status: "pending", token: "abc-token", expiresAt: futureDate,
    });
    (tx.tenant as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      name: "テスト",
    });
    mockMailer.send.mockResolvedValue({
      ok: false, errorMessage: "Connection timeout", retryable: true,
    });

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("failed");
    expect((result as { retryable: boolean }).retryable).toBe(true);
  });

  it("invitation が見つからない場合は dead", async () => {
    const { tx, job } = makeJob({ invitationId: 999 });
    (tx.tenantUserInvitation as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue(null);

    const result = await handleTenantUserInviteRequested({ tx: tx as never, job });
    expect(result.status).toBe("dead");
  });
});
