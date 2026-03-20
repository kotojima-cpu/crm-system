import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
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

vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));

// auth guard モック
vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn(async () => ({
    session: { user: { id: 1, role: "platform_admin" } },
    runInContext: async (fn: () => unknown) => fn(),
  })),
  requireTenantPermission: vi.fn(async () => ({
    session: { user: { id: 1, role: "tenant_admin" } },
    runInContext: async (fn: () => unknown) => fn(),
  })),
}));

// platform-outbox service モック
const mockListOutboxEvents = vi.fn();
const mockGetOutboxEventDetail = vi.fn();
const mockGetOutboxSummary = vi.fn();
const mockGetOutboxOperationalAlerts = vi.fn();
const mockRetryEvent = vi.fn();
const mockReplayDeadEvent = vi.fn();
const mockForceReplaySentEvent = vi.fn();
const mockRunPollCycle = vi.fn();

vi.mock("@/features/platform-outbox", () => ({
  listOutboxEvents: (...args: unknown[]) => mockListOutboxEvents(...args),
  getOutboxEventDetail: (...args: unknown[]) => mockGetOutboxEventDetail(...args),
  getOutboxSummary: (...args: unknown[]) => mockGetOutboxSummary(...args),
  getOutboxOperationalAlerts: (...args: unknown[]) => mockGetOutboxOperationalAlerts(...args),
  retryEvent: (...args: unknown[]) => mockRetryEvent(...args),
  replayDeadEvent: (...args: unknown[]) => mockReplayDeadEvent(...args),
  forceReplaySentEvent: (...args: unknown[]) => mockForceReplaySentEvent(...args),
  runPollCycle: (...args: unknown[]) => mockRunPollCycle(...args),
}));

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: { findMany: vi.fn(), update: vi.fn() } },
  withPlatformTx: vi.fn(),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const req = new NextRequest(url, {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
  return req;
}

const BASE = "http://localhost:3000";

// ────────────────────────────────────────────────────────────
// GET /api/platform/outbox — 一覧
// ────────────────────────────────────────────────────────────

describe("GET /api/platform/outbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("一覧を返す", async () => {
    mockListOutboxEvents.mockResolvedValue({ items: [], total: 0 });
    const { GET } = await import("@/app/api/platform/outbox/route");
    const req = makeRequest("GET", `${BASE}/api/platform/outbox`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toEqual([]);
    expect(json.data.total).toBe(0);
  });

  it("status フィルターが渡される", async () => {
    mockListOutboxEvents.mockResolvedValue({ items: [], total: 0 });
    const { GET } = await import("@/app/api/platform/outbox/route");
    const req = makeRequest("GET", `${BASE}/api/platform/outbox?status=failed&status=dead`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const filterArg = mockListOutboxEvents.mock.calls[0][0];
    expect(filterArg.status).toEqual(["failed", "dead"]);
  });
});

// ────────────────────────────────────────────────────────────
// GET /api/platform/outbox/summary
// ────────────────────────────────────────────────────────────

describe("GET /api/platform/outbox/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("summary を返す", async () => {
    mockGetOutboxSummary.mockResolvedValue({
      pendingCount: 5, processingCount: 1, failedCount: 2,
      deadCount: 1, sentCount: 100, retryableFailedCount: 2,
      stuckProcessingCount: 0, recoverableStuckCount: 0, oldestPendingCreatedAt: null,
      oldestFailedCreatedAt: null, recentErrorSamples: [],
    });
    mockGetOutboxOperationalAlerts.mockResolvedValue([]);

    const { GET } = await import("@/app/api/platform/outbox/summary/route");
    const req = makeRequest("GET", `${BASE}/api/platform/outbox/summary`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.pendingCount).toBe(5);
    expect(json.data.deadCount).toBe(1);
    expect(json.data.alerts).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// GET /api/platform/outbox/[eventId] — 詳細
// ────────────────────────────────────────────────────────────

describe("GET /api/platform/outbox/[eventId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("詳細を返す", async () => {
    mockGetOutboxEventDetail.mockResolvedValue({
      id: 1, eventType: "invoice.created", executionMode: "queue",
      status: "failed", retryCount: 1, maxRetries: 3, lastError: "timeout",
      availableAt: new Date(), processedAt: null, createdAt: new Date(),
      updatedAt: new Date(), maskedPayload: {},
    });

    const { GET } = await import("@/app/api/platform/outbox/[eventId]/route");
    const req = makeRequest("GET", `${BASE}/api/platform/outbox/1`);
    const res = await GET(req, { params: Promise.resolve({ eventId: "1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(1);
    expect(json.data.maskedPayload).toBeDefined();
  });

  it("不正な eventId は 400", async () => {
    const { GET } = await import("@/app/api/platform/outbox/[eventId]/route");
    const req = makeRequest("GET", `${BASE}/api/platform/outbox/abc`);
    const res = await GET(req, { params: Promise.resolve({ eventId: "abc" }) });
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/[eventId]/retry
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/[eventId]/retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retry 成功", async () => {
    mockRetryEvent.mockResolvedValue({ id: 1, status: "pending" });
    const { POST } = await import("@/app/api/platform/outbox/[eventId]/retry/route");
    const req = makeRequest("POST", `${BASE}/api/platform/outbox/1/retry`);
    const res = await POST(req, { params: Promise.resolve({ eventId: "1" }) });
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/[eventId]/replay
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/[eventId]/replay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replay 成功", async () => {
    mockReplayDeadEvent.mockResolvedValue({ id: 1, status: "pending" });
    const { POST } = await import("@/app/api/platform/outbox/[eventId]/replay/route");
    const req = makeRequest("POST", `${BASE}/api/platform/outbox/1/replay`);
    const res = await POST(req, { params: Promise.resolve({ eventId: "1" }) });
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/[eventId]/force-replay
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/[eventId]/force-replay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forceSentReplay=true で成功", async () => {
    mockForceReplaySentEvent.mockResolvedValue({ id: 1, status: "pending" });
    const { POST } = await import(
      "@/app/api/platform/outbox/[eventId]/force-replay/route"
    );
    const req = makeRequest(
      "POST",
      `${BASE}/api/platform/outbox/1/force-replay`,
      { forceSentReplay: true },
    );
    const res = await POST(req, { params: Promise.resolve({ eventId: "1" }) });
    expect(res.status).toBe(200);
  });

  it("forceSentReplay なしは 400", async () => {
    const { POST } = await import(
      "@/app/api/platform/outbox/[eventId]/force-replay/route"
    );
    const req = makeRequest(
      "POST",
      `${BASE}/api/platform/outbox/1/force-replay`,
      {},
    );
    const res = await POST(req, { params: Promise.resolve({ eventId: "1" }) });
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/poll
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/poll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("poll サイクルを実行する", async () => {
    mockRunPollCycle.mockResolvedValue({
      summary: { polledCount: 3, sentCount: 2, failedCount: 1, deadCount: 0, skippedCount: 0, errors: [] },
    });
    const { POST } = await import("@/app/api/platform/outbox/poll/route");
    const req = makeRequest("POST", `${BASE}/api/platform/outbox/poll`);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.summary).toBeDefined();
  });
});
