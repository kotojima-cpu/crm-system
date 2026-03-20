/**
 * Outbox Dispatcher 永続化テスト
 *
 * mark* 関数が prisma.outboxEvent.update を呼ぶことを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrismaOutboxEvent = {
  findUnique: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: mockPrismaOutboxEvent },
  withTenantTx: vi.fn(),
  withPlatformTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/worker/retry", () => ({
  calculateNextRetryAt: vi.fn(() => new Date("2026-03-18T00:00:00Z")),
  shouldRetryWorkerJob: vi.fn(),
  shouldMoveWorkerJobToDead: vi.fn(),
  isNonRetryableError: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

const {
  markOutboxProcessing,
  markOutboxSent,
  markOutboxFailed,
  markOutboxDead,
  loadOutboxEventById,
} = await import("@/outbox/dispatcher");
import { OutboxStatusTransitionError } from "@/outbox/errors";

function makeRecord(overrides: Partial<{
  id: number;
  status: string;
  retryCount: number;
  maxRetries: number;
}> = {}) {
  return {
    id: 1,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "pending" as const,
    payloadJson: "{}",
    availableAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    processedAt: null,
    ...overrides,
  };
}

describe("markOutboxProcessing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pending → processing で DB 更新する", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue({});
    const event = makeRecord({ status: "pending" });
    await markOutboxProcessing(event as never);
    expect(mockPrismaOutboxEvent.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: "processing" }),
    });
  });

  it("sent → processing は StatusTransitionError", async () => {
    const event = makeRecord({ status: "sent" as never });
    await expect(markOutboxProcessing(event as never)).rejects.toBeInstanceOf(
      OutboxStatusTransitionError,
    );
    expect(mockPrismaOutboxEvent.update).not.toHaveBeenCalled();
  });
});

describe("markOutboxSent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processing → sent で DB 更新し processedAt を設定する", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue({});
    const event = makeRecord({ status: "processing" as never });
    await markOutboxSent(event as never);
    expect(mockPrismaOutboxEvent.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: "sent",
        lastError: null,
      }),
    });
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    expect(data.processedAt).toBeInstanceOf(Date);
  });

  it("pending → sent は StatusTransitionError", async () => {
    const event = makeRecord({ status: "pending" });
    await expect(markOutboxSent(event as never)).rejects.toBeInstanceOf(
      OutboxStatusTransitionError,
    );
  });
});

describe("markOutboxFailed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processing → failed で retryCount 増加・lastError・availableAt を更新する", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue({});
    const event = makeRecord({ status: "processing" as never, retryCount: 1 });
    await markOutboxFailed(event as never, "SES throttle");
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    expect(data.status).toBe("failed");
    expect(data.retryCount).toBe(2);
    expect(data.lastError).toBe("SES throttle");
    expect(data.availableAt).toBeInstanceOf(Date);
  });

  it("sent → failed は StatusTransitionError", async () => {
    const event = makeRecord({ status: "sent" as never });
    await expect(markOutboxFailed(event as never, "err")).rejects.toBeInstanceOf(
      OutboxStatusTransitionError,
    );
  });
});

describe("markOutboxDead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processing → dead で DB 更新する", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue({});
    const event = makeRecord({ status: "processing" as never });
    await markOutboxDead(event as never, "max retries exceeded");
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    expect(data.status).toBe("dead");
    expect(data.lastError).toBe("max retries exceeded");
  });

  it("failed → dead で DB 更新する", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue({});
    const event = makeRecord({ status: "failed" as never });
    await markOutboxDead(event as never, "giving up");
    expect(mockPrismaOutboxEvent.update).toHaveBeenCalled();
  });

  it("sent → dead は StatusTransitionError", async () => {
    const event = makeRecord({ status: "sent" as never });
    await expect(markOutboxDead(event as never, "reason")).rejects.toBeInstanceOf(
      OutboxStatusTransitionError,
    );
  });
});

describe("loadOutboxEventById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("存在する ID で record を返す", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue({
      id: 5, eventType: "invoice.created", executionMode: "queue",
      status: "pending", payloadJson: "{}", availableAt: new Date(),
      retryCount: 0, maxRetries: 3, lastError: null, processedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const record = await loadOutboxEventById(5);
    expect(record).not.toBeNull();
    expect(record?.id).toBe(5);
  });

  it("存在しない ID で null を返す", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(null);
    const record = await loadOutboxEventById(999);
    expect(record).toBeNull();
  });
});
