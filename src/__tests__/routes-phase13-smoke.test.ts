/**
 * Phase 13 Route Smoke テスト
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() } },
  withTenantTx: vi.fn(),
  withPlatformTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/infrastructure", () => ({
  createMailer: vi.fn(() => ({ send: vi.fn() })),
  createWebhookDispatcher: vi.fn(() => ({ dispatch: vi.fn() })),
  createQueuePublisher: vi.fn(() => ({ publish: vi.fn() })),
  createEventBusPublisher: vi.fn(() => ({ publish: vi.fn() })),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

vi.mock("@/worker/retry", () => ({
  calculateNextRetryAt: vi.fn(() => new Date()),
  shouldRetryWorkerJob: vi.fn(() => false),
  shouldMoveWorkerJobToDead: vi.fn(() => true),
  isNonRetryableError: vi.fn(() => false),
}));

// --- Outbox 永続化系 smoke ---

describe("Outbox — DB モデル整合", () => {
  it("OutboxEvent Prisma model が利用可能", async () => {
    const { prisma } = await import("@/shared/db");
    expect(prisma.outboxEvent).toBeDefined();
  });
});

// --- Writer smoke ---

describe("Outbox writer — DB 書き込み", () => {
  it("writeOutboxEvent が tx.outboxEvent.create を呼ぶ", async () => {
    vi.mock("@/shared/context", () => ({
      getRequestContext: () => ({
        requestId: "req-smoke-001",
        executionContext: "system",
        tenantId: null,
        actorUserId: null,
        actorRole: null,
      }),
    }));

    const mockTx = {
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };

    const { writeOutboxEvent } = await import("@/outbox/writer");
    await writeOutboxEvent(mockTx as never, {
      eventType: "invoice.created",
      executionMode: "queue",
      jobType: "invoice.created",
      resourceId: 1,
      payload: { invoiceId: 1 },
      requestId: "req-smoke-001" as never,
      executionContext: "system",
      tenantId: null,
      actorUserId: null,
    });

    expect(mockTx.outboxEvent.create).toHaveBeenCalledOnce();
    const data = mockTx.outboxEvent.create.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.retryCount).toBe(0);
  });
});

// --- Consumer exports smoke ---

describe("Worker consumer exports", () => {
  it("consumeOutboxEventRecord がエクスポートされている", async () => {
    const { consumeOutboxEventRecord } = await import("@/worker/consumer");
    expect(consumeOutboxEventRecord).toBeTypeOf("function");
  });

  it("consumeOutboxEventById がエクスポートされている", async () => {
    const { consumeOutboxEventById } = await import("@/worker/consumer");
    expect(consumeOutboxEventById).toBeTypeOf("function");
  });

  it("consumeQueueMessage がエクスポートされている", async () => {
    const { consumeQueueMessage } = await import("@/worker/consumer");
    expect(consumeQueueMessage).toBeTypeOf("function");
  });
});

// --- Poller / Replay exports smoke ---

describe("Outbox poller/replay exports", () => {
  it("runOutboxPollCycle がエクスポートされている", async () => {
    const { runOutboxPollCycle } = await import("@/outbox");
    expect(runOutboxPollCycle).toBeTypeOf("function");
  });

  it("retryOutboxEventById がエクスポートされている", async () => {
    const { retryOutboxEventById } = await import("@/outbox");
    expect(retryOutboxEventById).toBeTypeOf("function");
  });

  it("replayDeadOutboxEventById がエクスポートされている", async () => {
    const { replayDeadOutboxEventById } = await import("@/outbox");
    expect(replayDeadOutboxEventById).toBeTypeOf("function");
  });
});

// --- platform-outbox feature smoke ---

describe("platform-outbox feature exports", () => {
  it("runPollCycle がエクスポートされている", async () => {
    const { runPollCycle } = await import("@/features/platform-outbox");
    expect(runPollCycle).toBeTypeOf("function");
  });

  it("retryEvent がエクスポートされている", async () => {
    const { retryEvent } = await import("@/features/platform-outbox");
    expect(retryEvent).toBeTypeOf("function");
  });
});
