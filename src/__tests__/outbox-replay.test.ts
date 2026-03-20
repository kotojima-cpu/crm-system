/**
 * Outbox Replay テスト
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

vi.mock("@/worker/consumer", () => ({
  consumeOutboxEventRecord: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

const {
  retryOutboxEventById,
  replayDeadOutboxEventById,
  resetOutboxEventToPending,
  forceReplaySentOutboxEvent,
} = await import("@/outbox/replay");
import { ValidationError, NotFoundError } from "@/shared/errors";

function makeRecord(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    eventType: "invoice.created",
    executionMode: "queue",
    status,
    payloadJson: "{}",
    availableAt: new Date(),
    retryCount: 2,
    maxRetries: 3,
    lastError: "prev error",
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("resetOutboxEventToPending", () => {
  beforeEach(() => vi.clearAllMocks());

  it("status を pending にリセットし availableAt を now にする", async () => {
    mockPrismaOutboxEvent.update.mockResolvedValue(makeRecord("pending", { lastError: null }));
    await resetOutboxEventToPending(10);
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.lastError).toBeNull();
    expect(data.availableAt).toBeInstanceOf(Date);
  });
});

describe("retryOutboxEventById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("failed event を pending にリセットする（handlerMap なし）", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("failed"));
    mockPrismaOutboxEvent.update.mockResolvedValue(makeRecord("pending"));

    const result = await retryOutboxEventById(10);
    expect(result.status).toBe("pending");
    expect(mockPrismaOutboxEvent.update).toHaveBeenCalled();
  });

  it("failed 以外は ValidationError", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("sent"));
    await expect(retryOutboxEventById(10)).rejects.toBeInstanceOf(ValidationError);
  });

  it("存在しない ID は NotFoundError", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(retryOutboxEventById(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("replayDeadOutboxEventById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dead event を pending に戻す", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("dead"));
    mockPrismaOutboxEvent.update.mockResolvedValue(makeRecord("pending", { retryCount: 2 }));

    const result = await replayDeadOutboxEventById(10);
    expect(result.status).toBe("pending");
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    // retryCount はリセットしない（デフォルト）
    expect(data.retryCount).toBe(2);
  });

  it("resetRetryCount=true で retryCount を 0 にリセットする", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("dead"));
    mockPrismaOutboxEvent.update.mockResolvedValue(makeRecord("pending", { retryCount: 0 }));

    await replayDeadOutboxEventById(10, { resetRetryCount: true });
    const data = mockPrismaOutboxEvent.update.mock.calls[0][0].data;
    expect(data.retryCount).toBe(0);
  });

  it("dead 以外は ValidationError", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("sent"));
    await expect(replayDeadOutboxEventById(10)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("forceReplaySentOutboxEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sent event を pending に戻す（forceSentReplay=true）", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("sent"));
    mockPrismaOutboxEvent.update.mockResolvedValue(makeRecord("pending"));

    const result = await forceReplaySentOutboxEvent(10, { forceSentReplay: true });
    expect(result.status).toBe("pending");
  });

  it("sent 以外は ValidationError", async () => {
    mockPrismaOutboxEvent.findUnique.mockResolvedValue(makeRecord("failed"));
    await expect(
      forceReplaySentOutboxEvent(10, { forceSentReplay: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
