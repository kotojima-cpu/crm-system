/**
 * Outbox Poller テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrismaOutboxEvent = {
  findMany: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
};

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: mockPrismaOutboxEvent },
  withTenantTx: vi.fn((_: unknown, fn: (tx: unknown) => unknown) => fn({})),
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  withSystemTx: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((o: Record<string, unknown>) => o),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((o: Record<string, unknown>) => o),
}));

vi.mock("@/worker/retry", () => ({
  calculateNextRetryAt: vi.fn(() => new Date()),
  shouldRetryWorkerJob: vi.fn(() => false),
  shouldMoveWorkerJobToDead: vi.fn(() => true),
  isNonRetryableError: vi.fn(() => false),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

// consumer を mock して poller テストを分離
vi.mock("@/worker/consumer", () => ({
  consumeOutboxEventRecord: vi.fn(),
}));

const { pollPendingOutboxEvents, runOutboxPollCycle } = await import(
  "@/outbox/poller"
);
const { consumeOutboxEventRecord } = await import("@/worker/consumer");
import { createWorkerHandlerMap } from "@/worker/handlers";

function makeDbRecord(overrides: Partial<{
  id: number;
  status: string;
}> = {}) {
  return {
    id: 1,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "pending",
    payloadJson: "{}",
    availableAt: new Date(Date.now() - 1000), // 過去
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("pollPendingOutboxEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pending かつ availableAt<=now のみ取得する", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([
      makeDbRecord({ id: 1 }),
      makeDbRecord({ id: 2 }),
    ]);

    const events = await pollPendingOutboxEvents({ limit: 10 });
    expect(events).toHaveLength(2);

    const call = mockPrismaOutboxEvent.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["pending", "failed"] });
    expect(call.where.availableAt).toEqual({ lte: expect.any(Date) });
  });

  it("件数上限が効く", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([]);
    await pollPendingOutboxEvents({ limit: 5 });
    expect(mockPrismaOutboxEvent.findMany.mock.calls[0][0].take).toBe(5);
  });

  it("executionMode フィルタが効く", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([]);
    await pollPendingOutboxEvents({ executionMode: "email" });
    const call = mockPrismaOutboxEvent.findMany.mock.calls[0][0];
    expect(call.where.executionMode).toBe("email");
  });
});

describe("runOutboxPollCycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("polled event ごとに consumer が呼ばれる", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([
      makeDbRecord({ id: 1 }),
      makeDbRecord({ id: 2 }),
    ]);
    (consumeOutboxEventRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "sent" });

    const handlerMap = createWorkerHandlerMap();
    const summary = await runOutboxPollCycle(handlerMap);

    expect(consumeOutboxEventRecord).toHaveBeenCalledTimes(2);
    expect(summary.polledCount).toBe(2);
    expect(summary.sentCount).toBe(2);
  });

  it("sent/failed/dead の件数が summary に反映される", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([
      makeDbRecord({ id: 1 }),
      makeDbRecord({ id: 2 }),
      makeDbRecord({ id: 3 }),
    ]);
    (consumeOutboxEventRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "failed", errorMessage: "e", retryable: true })
      .mockResolvedValueOnce({ status: "dead", errorMessage: "d" });

    const handlerMap = createWorkerHandlerMap();
    const summary = await runOutboxPollCycle(handlerMap);

    expect(summary.sentCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.deadCount).toBe(1);
  });

  it("0件の場合は何も実行されない", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([]);
    const handlerMap = createWorkerHandlerMap();
    const summary = await runOutboxPollCycle(handlerMap);
    expect(summary.polledCount).toBe(0);
    expect(consumeOutboxEventRecord).not.toHaveBeenCalled();
  });
});
