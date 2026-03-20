/**
 * Phase 17 smoke テスト
 *
 * 新規ルートと feature エクスポートの基本動作を検証する。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/db", () => ({
  prisma: {
    platformHealthCheckHistory: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(null),
    },
    platformAlertHistory: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn().mockResolvedValue({
    session: { user: { id: 1, role: "platform_admin" } },
    runInContext: async (fn: () => unknown) => fn(),
  }),
}));
vi.mock("@/shared/errors", () => ({
  toErrorResponse: (e: { message?: string }) => ({ error: { code: "ERROR", message: e.message ?? "error" } }),
}));
vi.mock("@/features/platform-health-history", () => ({
  listHealthCheckHistory: vi.fn().mockResolvedValue([]),
  getLatestHealthCheckHistory: vi.fn().mockResolvedValue(null),
  determineHealthCheckStatus: vi.fn().mockReturnValue("healthy"),
  determineHealthCheckStatusFromCodes: vi.fn().mockReturnValue("healthy"),
  saveHealthCheckHistory: vi.fn().mockResolvedValue(null),
}));

import { NextRequest } from "next/server";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

// ────────────────────────────────────────────────────────────
// Smoke 1: platform-alert-history exports
// ────────────────────────────────────────────────────────────

describe("[Phase 17] platform-alert-history exports", () => {
  it("buildAlertDedupKey がエクスポートされている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(mod.buildAlertDedupKey).toBeTypeOf("function");
  });

  it("shouldSendPlatformAlert がエクスポートされている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(mod.shouldSendPlatformAlert).toBeTypeOf("function");
  });

  it("markPlatformAlertSent がエクスポートされている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(mod.markPlatformAlertSent).toBeTypeOf("function");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 2: platform-health-history exports
// ────────────────────────────────────────────────────────────

describe("[Phase 17] platform-health-history exports", () => {
  it("determineHealthCheckStatus がエクスポートされている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(mod.determineHealthCheckStatus).toBeTypeOf("function");
  });

  it("saveHealthCheckHistory がエクスポートされている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(mod.saveHealthCheckHistory).toBeTypeOf("function");
  });

  it("listHealthCheckHistory がエクスポートされている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(mod.listHealthCheckHistory).toBeTypeOf("function");
  });

  it("getLatestHealthCheckHistory がエクスポートされている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(mod.getLatestHealthCheckHistory).toBeTypeOf("function");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 3: GET /api/platform/outbox/health-history
// ────────────────────────────────────────────────────────────

describe("[Phase 17] GET /api/platform/outbox/health-history", () => {
  it("200 と data.items を返す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/health-history/route");
    const req = makeRequest("http://localhost/api/platform/outbox/health-history");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("items");
    expect(Array.isArray(json.data.items)).toBe(true);
  });

  it("limit パラメータを受け取る", async () => {
    const { GET } = await import("@/app/api/platform/outbox/health-history/route");
    const req = makeRequest("http://localhost/api/platform/outbox/health-history?limit=5");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 4: GET /api/platform/outbox/alert-status
// ────────────────────────────────────────────────────────────

describe("[Phase 17] GET /api/platform/outbox/alert-status", () => {
  it("200 と lastHealthCheckAt, suppressedByCooldown, alertCodes を返す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/alert-status/route");
    const req = makeRequest("http://localhost/api/platform/outbox/alert-status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("lastHealthCheckAt");
    expect(json.data).toHaveProperty("suppressedByCooldown");
    expect(json.data).toHaveProperty("alertCodes");
    expect(json.data).toHaveProperty("status");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 5: audit/actions AUDIT_OUTBOX_ALERT_SUPPRESSED
// ────────────────────────────────────────────────────────────

describe("[Phase 17] audit actions", () => {
  it("AUDIT_OUTBOX_ALERT_SUPPRESSED がエクスポートされている", async () => {
    const mod = await import("@/audit/actions");
    expect(mod.AUDIT_OUTBOX_ALERT_SUPPRESSED).toBeDefined();
    expect(mod.AUDIT_OUTBOX_ALERT_SUPPRESSED.action).toBe("suppress");
    expect(mod.AUDIT_OUTBOX_ALERT_SUPPRESSED.resourceType).toBe("outbox_event");
  });
});
