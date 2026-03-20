import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// prisma モック
const mockPrismaOutboxEvent = {
  groupBy: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
};

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: mockPrismaOutboxEvent },
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ outboxEvent: { findMany: vi.fn() }, auditLog: { create: vi.fn() } }),
  ),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));

const {
  getOutboxStatusCounts,
  getStuckProcessingCount,
  getOldestCreatedAt,
  getRecentErrorSamples,
  buildOutboxSummary,
} = await import("@/features/platform-outbox/repository");

// ────────────────────────────────────────────────────────────
// getOutboxStatusCounts
// ────────────────────────────────────────────────────────────

describe("getOutboxStatusCounts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("groupBy 結果をステータス別件数に変換する", async () => {
    mockPrismaOutboxEvent.groupBy.mockResolvedValue([
      { status: "pending", _count: { id: 10 } },
      { status: "failed", _count: { id: 3 } },
      { status: "dead", _count: { id: 1 } },
    ]);

    const counts = await getOutboxStatusCounts();
    expect(counts.pending).toBe(10);
    expect(counts.failed).toBe(3);
    expect(counts.dead).toBe(1);
    expect(counts.sent).toBe(0); // デフォルト 0
    expect(counts.processing).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// getStuckProcessingCount
// ────────────────────────────────────────────────────────────

describe("getStuckProcessingCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("15分以上 processing の件数を返す", async () => {
    mockPrismaOutboxEvent.count.mockResolvedValue(2);
    const count = await getStuckProcessingCount();
    expect(count).toBe(2);
    // where に { status: "processing", updatedAt: { lt: ... } } が渡されているか確認
    const where = mockPrismaOutboxEvent.count.mock.calls[0][0].where;
    expect(where.status).toBe("processing");
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
  });
});

// ────────────────────────────────────────────────────────────
// getOldestCreatedAt
// ────────────────────────────────────────────────────────────

describe("getOldestCreatedAt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("最古の pending の createdAt を返す", async () => {
    const date = new Date("2026-01-01");
    mockPrismaOutboxEvent.findFirst.mockResolvedValue({ createdAt: date });

    const result = await getOldestCreatedAt("pending");
    expect(result).toEqual(date);
  });

  it("存在しない場合は null", async () => {
    mockPrismaOutboxEvent.findFirst.mockResolvedValue(null);
    const result = await getOldestCreatedAt("pending");
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// getRecentErrorSamples
// ────────────────────────────────────────────────────────────

describe("getRecentErrorSamples", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lastError が null のレコードを除外する", async () => {
    mockPrismaOutboxEvent.findMany.mockResolvedValue([
      { id: 1, eventType: "invoice.created", lastError: "timeout" },
      { id: 2, eventType: "invoice.created", lastError: null },
    ]);

    const samples = await getRecentErrorSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].lastError).toBe("timeout");
  });
});

// ────────────────────────────────────────────────────────────
// buildOutboxSummary（統合）
// ────────────────────────────────────────────────────────────

describe("buildOutboxSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("全集計を組み合わせて OutboxSummary を返す", async () => {
    mockPrismaOutboxEvent.groupBy.mockResolvedValue([
      { status: "pending", _count: { id: 5 } },
      { status: "failed", _count: { id: 2 } },
      { status: "dead", _count: { id: 1 } },
      { status: "sent", _count: { id: 100 } },
    ]);
    mockPrismaOutboxEvent.count.mockResolvedValue(0); // stuck + retryable
    mockPrismaOutboxEvent.findFirst.mockResolvedValue({ createdAt: new Date("2026-03-01") });
    mockPrismaOutboxEvent.findMany.mockResolvedValue([]);

    const summary = await buildOutboxSummary();
    expect(summary.pendingCount).toBe(5);
    expect(summary.failedCount).toBe(2);
    expect(summary.deadCount).toBe(1);
    expect(summary.sentCount).toBe(100);
    expect(summary.processingCount).toBe(0);
    expect(summary.oldestPendingCreatedAt).toEqual(new Date("2026-03-01"));
    expect(summary.recentErrorSamples).toHaveLength(0);
  });
});
