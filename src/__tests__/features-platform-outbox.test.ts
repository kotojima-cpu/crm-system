import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => ({
    requestId: "req-po-001",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
    actorRole: "platform_admin",
  }),
  requireRequestContext: () => ({
    requestId: "req-po-001",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
    actorRole: "platform_admin",
  }),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => ({
    requestId: "req-po-001",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
    actorRole: "platform_admin",
  }),
  requireRequestContext: () => ({
    requestId: "req-po-001",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
    actorRole: "platform_admin",
  }),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));

// prisma モック
const mockOutboxEvent = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  update: vi.fn(),
  findFirst: vi.fn(),
};
const mockAuditLog = { create: vi.fn() };

vi.mock("@/shared/db", () => ({
  prisma: {
    outboxEvent: mockOutboxEvent,
  },
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ outboxEvent: mockOutboxEvent, auditLog: mockAuditLog }),
  ),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

// replay モック
vi.mock("@/outbox/replay", () => ({
  retryOutboxEventById: vi.fn(),
  replayDeadOutboxEventById: vi.fn(),
  forceReplaySentOutboxEvent: vi.fn(),
  resetOutboxEventToPending: vi.fn(),
}));

// outbox poller モック
vi.mock("@/outbox/poller", () => ({
  runOutboxPollCycle: vi.fn(),
}));

// worker handlers モック
vi.mock("@/worker/handlers/index", () => ({
  createRegisteredHandlerMap: vi.fn(() => new Map()),
}));

const {
  listOutboxEvents,
  getOutboxEventById,
  getOutboxEventDetail,
  getOutboxSummary,
  getOutboxOperationalAlerts,
  retryEvent,
  replayDeadEvent,
  forceReplaySentEvent,
} = await import("@/features/platform-outbox/service");

import { NotFoundError, ValidationError } from "@/shared/errors";
import {
  retryOutboxEventById,
  replayDeadOutboxEventById,
  forceReplaySentOutboxEvent,
} from "@/outbox/replay";

const NOW = new Date("2026-04-01T00:00:00Z");

function makeRawRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "failed",
    retryCount: 1,
    maxRetries: 3,
    lastError: "timeout",
    availableAt: NOW,
    processedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    payloadJson: JSON.stringify({ requestId: "req-001", tenantId: 5 }),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// listOutboxEvents
// ────────────────────────────────────────────────────────────

describe("listOutboxEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filter で status が絞り込まれる", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeRawRecord()]);
    mockOutboxEvent.count.mockResolvedValue(1);

    const { items, total } = await listOutboxEvents({ status: ["failed"] });
    expect(items).toHaveLength(1);
    expect(total).toBe(1);

    const where = mockOutboxEvent.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["failed"] });
  });

  it("フィルターなしで全件取得する", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeRawRecord(), makeRawRecord({ id: 2 })]);
    mockOutboxEvent.count.mockResolvedValue(2);

    const { items, total } = await listOutboxEvents();
    expect(items).toHaveLength(2);
    expect(total).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────
// getOutboxEventById
// ────────────────────────────────────────────────────────────

describe("getOutboxEventById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("存在するイベントを返す", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(makeRawRecord());
    const event = await getOutboxEventById(1);
    expect(event.id).toBe(1);
  });

  it("存在しない ID は NotFoundError", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(getOutboxEventById(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ────────────────────────────────────────────────────────────
// getOutboxEventDetail
// ────────────────────────────────────────────────────────────

describe("getOutboxEventDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maskedPayload が含まれる", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(
      makeRawRecord({
        payloadJson: JSON.stringify({ requestId: "r1", secretApiKey: "xxx" }),
      }),
    );

    const detail = await getOutboxEventDetail(1);
    expect(detail.maskedPayload.secretApiKey).toBe("[REDACTED]");
    expect(detail.requestId).toBe("r1");
  });

  it("存在しない ID は NotFoundError", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(getOutboxEventDetail(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ────────────────────────────────────────────────────────────
// getOutboxSummary
// ────────────────────────────────────────────────────────────

describe("getOutboxSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summary が返る", async () => {
    mockOutboxEvent.groupBy.mockResolvedValue([
      { status: "pending", _count: { id: 3 } },
      { status: "dead", _count: { id: 1 } },
    ]);
    mockOutboxEvent.count.mockResolvedValue(0);
    mockOutboxEvent.findFirst.mockResolvedValue({ createdAt: NOW });
    mockOutboxEvent.findMany.mockResolvedValue([]);

    const summary = await getOutboxSummary();
    expect(summary.pendingCount).toBe(3);
    expect(summary.deadCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// getOutboxOperationalAlerts
// ────────────────────────────────────────────────────────────

describe("getOutboxOperationalAlerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dead が 1 件以上で DEAD_EVENTS_EXIST アラートが出る", async () => {
    mockOutboxEvent.groupBy.mockResolvedValue([
      { status: "dead", _count: { id: 2 } },
    ]);
    mockOutboxEvent.count.mockResolvedValue(0);
    mockOutboxEvent.findFirst.mockResolvedValue(null);
    mockOutboxEvent.findMany.mockResolvedValue([]);

    const alerts = await getOutboxOperationalAlerts();
    expect(alerts.some((a) => a.code === "DEAD_EVENTS_EXIST")).toBe(true);
  });

  it("アラートなしの場合は空配列", async () => {
    mockOutboxEvent.groupBy.mockResolvedValue([]);
    mockOutboxEvent.count.mockResolvedValue(0);
    mockOutboxEvent.findFirst.mockResolvedValue(null);
    mockOutboxEvent.findMany.mockResolvedValue([]);

    const alerts = await getOutboxOperationalAlerts();
    expect(alerts).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// retryEvent
// ────────────────────────────────────────────────────────────

describe("retryEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("failed event を retry する", async () => {
    const raw = makeRawRecord({ status: "failed" });
    mockOutboxEvent.findUnique.mockResolvedValue(raw);
    vi.mocked(retryOutboxEventById).mockResolvedValue({
      ...raw,
      status: "pending" as never,
    });
    mockAuditLog.create.mockResolvedValue({});

    const result = await retryEvent(1);
    expect(result.status).toBe("pending");
  });

  it("存在しない ID は NotFoundError", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(retryEvent(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ────────────────────────────────────────────────────────────
// replayDeadEvent
// ────────────────────────────────────────────────────────────

describe("replayDeadEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("dead event を pending に戻す", async () => {
    const raw = makeRawRecord({ status: "dead" });
    mockOutboxEvent.findUnique.mockResolvedValue(raw);
    vi.mocked(replayDeadOutboxEventById).mockResolvedValue({
      ...raw,
      status: "pending" as never,
    });
    mockAuditLog.create.mockResolvedValue({});

    const result = await replayDeadEvent(1);
    expect(result.status).toBe("pending");
  });

  it("存在しない ID は NotFoundError", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(replayDeadEvent(999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ────────────────────────────────────────────────────────────
// forceReplaySentEvent
// ────────────────────────────────────────────────────────────

describe("forceReplaySentEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sent event を強制 replay する", async () => {
    const raw = makeRawRecord({ status: "sent" });
    mockOutboxEvent.findUnique.mockResolvedValue(raw);
    vi.mocked(forceReplaySentOutboxEvent).mockResolvedValue({
      ...raw,
      status: "pending" as never,
    });
    mockAuditLog.create.mockResolvedValue({});

    const result = await forceReplaySentEvent(1, { forceSentReplay: true });
    expect(result.status).toBe("pending");
    expect(mockAuditLog.create).toHaveBeenCalled();
  });

  it("存在しない ID は NotFoundError", async () => {
    mockOutboxEvent.findUnique.mockResolvedValue(null);
    await expect(
      forceReplaySentEvent(999, { forceSentReplay: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
