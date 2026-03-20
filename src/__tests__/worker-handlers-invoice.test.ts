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

const { handleInvoiceCreated } = await import(
  "@/worker/handlers/invoice-created"
);
const { handleInvoiceConfirmed } = await import(
  "@/worker/handlers/invoice-confirmed"
);

import type { ParsedWorkerJob } from "@/worker/types";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";

function makeJob(
  eventType: string,
  payload: Record<string, unknown>,
  tenantId: number | null = 1,
): { tx: Record<string, unknown>; job: ParsedWorkerJob } {
  const envelope: OutboxEventPayloadEnvelope = {
    tenantId: tenantId as never,
    actorUserId: 10 as never,
    executionContext: "tenant",
    requestId: "req-worker-001" as never,
    jobType: eventType,
    resourceId: payload.invoiceId as number,
    payload,
  };

  const tx: Record<string, unknown> = {
    invoice: {
      findFirst: vi.fn(),
    },
    leaseContract: {
      findFirst: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
  };

  return {
    tx,
    job: {
      source: "outbox",
      eventType,
      executionMode: "queue",
      payloadEnvelope: envelope,
      rawPayloadJson: JSON.stringify(envelope),
      recordId: 1,
      retryCount: 0,
      maxRetries: 3,
    },
  };
}

describe("handleInvoiceCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB 再確認後に mailer が呼ばれる", async () => {
    const { tx, job } = makeJob("invoice.created", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 1, contractId: 1, customerId: 100,
      amount: 50000, periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30"),
    });
    (tx.leaseContract as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      productName: "複合機A", customerId: 100,
    });
    (tx.customer as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      companyName: "テスト株式会社", contactEmail: "test@example.com",
    });
    mockMailer.send.mockResolvedValue({ ok: true });

    const result = await handleInvoiceCreated({ tx: tx as never, job });
    expect(result.status).toBe("sent");
    expect(mockMailer.send).toHaveBeenCalledOnce();
    expect(mockMailer.send.mock.calls[0][0].to).toBe("test@example.com");
  });

  it("invoice が見つからない場合は dead", async () => {
    const { tx, job } = makeJob("invoice.created", { invoiceId: 999 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue(null);

    const result = await handleInvoiceCreated({ tx: tx as never, job });
    expect(result.status).toBe("dead");
  });

  it("tenant ownership mismatch で dead", async () => {
    const { tx, job } = makeJob("invoice.created", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 999, // mismatch
      contractId: 1, customerId: 100,
      amount: 50000, periodStart: new Date(), periodEnd: new Date(),
    });

    await expect(
      handleInvoiceCreated({ tx: tx as never, job }),
    ).rejects.toThrow();
  });

  it("contactEmail がない場合は sent（スキップ）", async () => {
    const { tx, job } = makeJob("invoice.created", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 1, contractId: 1, customerId: 100,
      amount: 50000, periodStart: new Date(), periodEnd: new Date(),
    });
    (tx.leaseContract as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      productName: "A", customerId: 100,
    });
    (tx.customer as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      companyName: "テスト", contactEmail: null,
    });

    const result = await handleInvoiceCreated({ tx: tx as never, job });
    expect(result.status).toBe("sent");
    expect(mockMailer.send).not.toHaveBeenCalled();
  });

  it("mailer failure を retryable で返す", async () => {
    const { tx, job } = makeJob("invoice.created", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 1, contractId: 1, customerId: 100,
      amount: 50000, periodStart: new Date(), periodEnd: new Date(),
    });
    (tx.leaseContract as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      productName: "A", customerId: 100,
    });
    (tx.customer as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      companyName: "テスト", contactEmail: "test@example.com",
    });
    mockMailer.send.mockResolvedValue({
      ok: false, errorMessage: "SES throttle", retryable: true,
    });

    const result = await handleInvoiceCreated({ tx: tx as never, job });
    expect(result.status).toBe("failed");
    expect((result as { retryable: boolean }).retryable).toBe(true);
  });
});

describe("handleInvoiceConfirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirmed 状態の invoice で mailer が呼ばれる", async () => {
    const { tx, job } = makeJob("invoice.confirmed", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 1, contractId: 1, customerId: 100,
      amount: 50000, status: "confirmed",
      periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-30"),
    });
    (tx.customer as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      companyName: "テスト", contactEmail: "test@example.com",
    });
    mockMailer.send.mockResolvedValue({ ok: true });

    const result = await handleInvoiceConfirmed({ tx: tx as never, job });
    expect(result.status).toBe("sent");
  });

  it("confirmed でない invoice は dead", async () => {
    const { tx, job } = makeJob("invoice.confirmed", { invoiceId: 10 });
    (tx.invoice as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 10, tenantId: 1, status: "draft",
    });

    const result = await handleInvoiceConfirmed({ tx: tx as never, job });
    expect(result.status).toBe("dead");
  });
});
