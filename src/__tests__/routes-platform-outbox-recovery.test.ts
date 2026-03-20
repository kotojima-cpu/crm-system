/**
 * Platform Outbox Recovery Routes テスト
 *
 * - recover-stuck route
 * - health-check route
 * - recoverable-stuck route
 * - 正しい permission を使うこと
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));
vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_: unknown, fn: () => unknown) => fn()),
}));
vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));

// platform-outbox feature モック
const mockRunOutboxHealthCheck = vi.fn();
const mockRecoverStuckEventsAndReport = vi.fn();

vi.mock("@/features/platform-outbox", () => ({
  runOutboxHealthCheck: (...a: unknown[]) => mockRunOutboxHealthCheck(...a),
  recoverStuckEventsAndReport: (...a: unknown[]) => mockRecoverStuckEventsAndReport(...a),
}));

// platform-outbox-recovery モック
const mockListRecoverableStuckEvents = vi.fn();

vi.mock("@/features/platform-outbox-recovery", () => ({
  listRecoverableStuckEvents: (...a: unknown[]) => mockListRecoverableStuckEvents(...a),
  recoverStuckOutboxEvents: vi.fn(),
  countRecoverableStuckOutboxEvents: vi.fn(),
}));

// requirePlatformPermission モック — Permission 引数を記録
const mockRequirePlatformPermission = vi.fn(async () => ({
  session: { user: { id: 1, role: "platform_admin" } },
  runInContext: async (fn: () => unknown) => fn(),
}));

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: (...args: unknown[]) => mockRequirePlatformPermission(...args),
  requireTenantPermission: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  prisma: {
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
  withPlatformTx: vi.fn(),
}));

import { Permission } from "@/auth/permissions";

const HEALTH_CHECK_RESULT = {
  summary: { pendingCount: 0, failedCount: 0, deadCount: 0, processingCount: 0, sentCount: 50, stuckProcessingCount: 0, recoverableStuckCount: 0, retryableFailedCount: 0, oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [] },
  alerts: [],
  metricsPublished: true,
  notificationsSent: false,
  notificationReasons: [],
  status: "healthy" as const,
  suppressedByCooldown: false,
};

const RECOVERY_RESULT = {
  recovery: { scannedCount: 2, recoveredCount: 2, skippedCount: 0, dryRun: false, recoveredIds: [1, 2], skippedIds: [] },
  healthCheck: HEALTH_CHECK_RESULT,
};

function makeRequest(method: string, body?: unknown, url = "http://localhost/test"): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/health-check
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/health-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunOutboxHealthCheck.mockResolvedValue(HEALTH_CHECK_RESULT);
  });

  it("200 + health check 結果を返す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/health-check/route");
    const res = await POST(makeRequest("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.metricsPublished).toBe(true);
  });

  it("OUTBOX_HEALTH_CHECK permission を使う", async () => {
    const { POST } = await import("@/app/api/platform/outbox/health-check/route");
    await POST(makeRequest("POST"));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_HEALTH_CHECK,
      expect.anything(),
    );
  });
});

// ────────────────────────────────────────────────────────────
// POST /api/platform/outbox/recover-stuck
// ────────────────────────────────────────────────────────────

describe("POST /api/platform/outbox/recover-stuck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecoverStuckEventsAndReport.mockResolvedValue(RECOVERY_RESULT);
  });

  it("200 + recovery 結果を返す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/recover-stuck/route");
    const res = await POST(makeRequest("POST", { thresholdMinutes: 20, limit: 50, dryRun: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recovery.recoveredCount).toBe(2);
  });

  it("OUTBOX_RECOVER_STUCK permission を使う", async () => {
    const { POST } = await import("@/app/api/platform/outbox/recover-stuck/route");
    await POST(makeRequest("POST", {}));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_RECOVER_STUCK,
      expect.anything(),
    );
  });

  it("dryRun=true を渡す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/recover-stuck/route");
    await POST(makeRequest("POST", { dryRun: true }));
    const callArg = mockRecoverStuckEventsAndReport.mock.calls[0][0];
    expect(callArg.dryRun).toBe(true);
  });

  it("ValidationError → 400", async () => {
    const { ValidationError } = await import("@/shared/errors");
    mockRecoverStuckEventsAndReport.mockRejectedValue(
      new ValidationError("limit must be between 1 and 500"),
    );
    const { POST } = await import("@/app/api/platform/outbox/recover-stuck/route");
    const res = await POST(makeRequest("POST", { limit: 999 }));
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────
// GET /api/platform/outbox/recoverable-stuck
// ────────────────────────────────────────────────────────────

describe("GET /api/platform/outbox/recoverable-stuck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListRecoverableStuckEvents.mockResolvedValue([
      { id: 5, eventType: "invoice.created", executionMode: "queue", status: "processing", updatedAt: new Date(), retryCount: 0, maxRetries: 3 },
    ]);
  });

  it("200 + stuck event 一覧を返す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/recoverable-stuck/route");
    const res = await GET(makeRequest("GET", undefined, "http://localhost/api/platform/outbox/recoverable-stuck"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it("OUTBOX_READ permission を使う", async () => {
    const { GET } = await import("@/app/api/platform/outbox/recoverable-stuck/route");
    await GET(makeRequest("GET", undefined, "http://localhost/api/platform/outbox/recoverable-stuck"));
    expect(mockRequirePlatformPermission).toHaveBeenCalledWith(
      Permission.OUTBOX_READ,
      expect.anything(),
    );
  });
});
