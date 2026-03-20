/**
 * Platform Outbox Routes — Permission 切替テスト
 *
 * 各 route が正しい Permission を requirePlatformPermission に渡すことを検証。
 * (BATCH_EXECUTE から操作別権限への切替が正しく行われているか)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
}));
vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));
vi.mock("@/shared/db", () => ({
  prisma: {
    outboxEvent: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

// platform-outbox feature モック
vi.mock("@/features/platform-outbox", () => ({
  listOutboxEvents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getOutboxEventDetail: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
  getOutboxSummary: vi.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0, deadCount: 0, sentCount: 0, processingCount: 0, retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0, oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [] }),
  getOutboxOperationalAlerts: vi.fn().mockResolvedValue([]),
  retryEvent: vi.fn().mockResolvedValue({ id: 1, status: "pending" }),
  replayDeadEvent: vi.fn().mockResolvedValue({ id: 2, status: "pending" }),
  forceReplaySentEvent: vi.fn().mockResolvedValue({ id: 3, status: "pending" }),
  runPollCycle: vi.fn().mockResolvedValue({ summary: { polledCount: 0, sentCount: 0, failedCount: 0 } }),
}));

// requirePlatformPermission — Permission 引数を記録する
const mockRequirePlatformPermission = vi.fn(async () => ({
  session: { user: { id: 1, role: "platform_admin" } },
  runInContext: async (fn: () => unknown) => fn(),
}));

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: (...args: unknown[]) => mockRequirePlatformPermission(...args),
  requireTenantPermission: vi.fn(async () => ({
    session: { user: { id: 1, role: "tenant_admin" } },
    runInContext: async (fn: () => unknown) => fn(),
  })),
}));

import { Permission } from "@/auth/permissions";

function makeRequest(method = "GET", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/outbox", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/platform/outbox — OUTBOX_READ", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_READ を渡す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/route");
    await GET(makeRequest("GET"));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_READ,
      expect.anything(),
    );
  });
});

describe("GET /api/platform/outbox/summary — OUTBOX_READ", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_READ を渡す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/summary/route");
    await GET(makeRequest("GET"));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_READ,
      expect.anything(),
    );
  });
});

describe("POST /api/platform/outbox/[eventId]/retry — OUTBOX_RETRY", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_RETRY を渡す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/[eventId]/retry/route");
    await POST(makeRequest("POST"), { params: Promise.resolve({ eventId: "1" }) });
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_RETRY,
      expect.anything(),
    );
  });
});

describe("POST /api/platform/outbox/[eventId]/replay — OUTBOX_REPLAY", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_REPLAY を渡す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/[eventId]/replay/route");
    await POST(makeRequest("POST"), { params: Promise.resolve({ eventId: "2" }) });
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_REPLAY,
      expect.anything(),
    );
  });
});

describe("POST /api/platform/outbox/[eventId]/force-replay — OUTBOX_FORCE_REPLAY", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_FORCE_REPLAY を渡す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/[eventId]/force-replay/route");
    await POST(
      makeRequest("POST", { forceSentReplay: true }),
      { params: Promise.resolve({ eventId: "3" }) },
    );
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_FORCE_REPLAY,
      expect.anything(),
    );
  });
});

describe("POST /api/platform/outbox/poll — OUTBOX_POLL_EXECUTE", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requirePlatformPermission に OUTBOX_POLL_EXECUTE を渡す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/poll/route");
    await POST(makeRequest("POST", { limit: 10 }));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_POLL_EXECUTE,
      expect.anything(),
    );
  });
});

describe("BATCH_EXECUTE は outbox routes で使われていないこと", () => {
  it("各 route に渡された permission に BATCH_EXECUTE が含まれていない", async () => {
    mockRequirePlatformPermission.mockClear();

    // 全ルートを一度呼ぶ
    const [list, summary, retry, replay, forceReplay, poll] = await Promise.all([
      import("@/app/api/platform/outbox/route"),
      import("@/app/api/platform/outbox/summary/route"),
      import("@/app/api/platform/outbox/[eventId]/retry/route"),
      import("@/app/api/platform/outbox/[eventId]/replay/route"),
      import("@/app/api/platform/outbox/[eventId]/force-replay/route"),
      import("@/app/api/platform/outbox/poll/route"),
    ]);

    await list.GET(makeRequest());
    await summary.GET(makeRequest());
    await retry.POST(makeRequest("POST"), { params: Promise.resolve({ eventId: "1" }) });
    await replay.POST(makeRequest("POST"), { params: Promise.resolve({ eventId: "2" }) });
    await forceReplay.POST(makeRequest("POST", { forceSentReplay: true }), { params: Promise.resolve({ eventId: "3" }) });
    await poll.POST(makeRequest("POST", {}));

    const allCalledPermissions = mockRequirePlatformPermission.mock.calls.map((c) => c[0]);
    expect(allCalledPermissions).not.toContain(Permission.BATCH_EXECUTE);
  });
});
