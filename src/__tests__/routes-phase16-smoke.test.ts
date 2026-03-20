/**
 * Phase 16 スモークテスト
 *
 * Phase 16 で追加したコンポーネントの整合性を確認:
 * - feature exports
 * - route import
 * - permission 追加
 * - stuck recovery の仕様
 * - alert notification の仕様
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// ────────────────────────────────────────────────────────────
// Smoke 1: platform-outbox-recovery feature exports
// ────────────────────────────────────────────────────────────

describe("[Phase 16] platform-outbox-recovery exports", () => {
  it("recoverStuckOutboxEvents / listRecoverableStuckEvents / countRecoverableStuckOutboxEvents がエクスポートされている", async () => {
    const mod = await import("@/features/platform-outbox-recovery");
    expect(typeof mod.recoverStuckOutboxEvents).toBe("function");
    expect(typeof mod.listRecoverableStuckEvents).toBe("function");
    expect(typeof mod.countRecoverableStuckOutboxEvents).toBe("function");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 2: platform-alerts exports
// ────────────────────────────────────────────────────────────

describe("[Phase 16] platform-alerts exports", () => {
  it("notifyOutboxOperationalAlerts がエクスポートされている", async () => {
    const mod = await import("@/features/platform-alerts");
    expect(typeof mod.notifyOutboxOperationalAlerts).toBe("function");
  });

  it("template helpers がエクスポートされている", async () => {
    const mod = await import("@/features/platform-alerts");
    expect(typeof mod.buildOutboxAlertWebhookPayload).toBe("function");
    expect(typeof mod.buildOutboxAlertMailSubject).toBe("function");
    expect(typeof mod.buildOutboxAlertMailBody).toBe("function");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 3: platform-outbox exports (new functions)
// ────────────────────────────────────────────────────────────

vi.mock("@/shared/db", () => ({
  prisma: {
    outboxEvent: {
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn() },
  },
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) => fn({ auditLog: { create: vi.fn() } })),
}));

vi.mock("@/infrastructure/factory", () => ({
  createMetricsPublisher: () => ({
    publish: vi.fn(),
    publishMany: vi.fn().mockResolvedValue(undefined),
  }),
  createWebhookDispatcher: () => ({ dispatch: vi.fn().mockResolvedValue({ ok: true }) }),
  createMailer: () => ({ send: vi.fn().mockResolvedValue({ ok: true }) }),
}));

vi.mock("@/infrastructure/config", () => ({
  getSesFromAddress: () => "noreply@example.com",
}));

describe("[Phase 16] platform-outbox exports (新関数)", () => {
  it("runOutboxHealthCheck が platform-outbox からエクスポートされている", async () => {
    const mod = await import("@/features/platform-outbox");
    expect(typeof mod.runOutboxHealthCheck).toBe("function");
  });

  it("recoverStuckEventsAndReport が platform-outbox からエクスポートされている", async () => {
    const mod = await import("@/features/platform-outbox");
    expect(typeof mod.recoverStuckEventsAndReport).toBe("function");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 4: Permission 追加確認
// ────────────────────────────────────────────────────────────

describe("[Phase 16] Permission 追加", () => {
  it("OUTBOX_RECOVER_STUCK が enum に定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.OUTBOX_RECOVER_STUCK).toBe("OUTBOX_RECOVER_STUCK");
  });

  it("OUTBOX_HEALTH_CHECK が enum に定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.OUTBOX_HEALTH_CHECK).toBe("OUTBOX_HEALTH_CHECK");
  });

  it("platform_admin は OUTBOX_RECOVER_STUCK を持つ", async () => {
    const { Permission, hasPermission } = await import("@/auth/permissions");
    expect(hasPermission("platform_admin", Permission.OUTBOX_RECOVER_STUCK)).toBe(true);
  });

  it("platform_admin は OUTBOX_HEALTH_CHECK を持つ", async () => {
    const { Permission, hasPermission } = await import("@/auth/permissions");
    expect(hasPermission("platform_admin", Permission.OUTBOX_HEALTH_CHECK)).toBe(true);
  });

  it("tenant_admin は新規権限を持たない", async () => {
    const { Permission, hasPermission } = await import("@/auth/permissions");
    expect(hasPermission("tenant_admin", Permission.OUTBOX_RECOVER_STUCK)).toBe(false);
    expect(hasPermission("tenant_admin", Permission.OUTBOX_HEALTH_CHECK)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 5: Audit 追加確認
// ────────────────────────────────────────────────────────────

describe("[Phase 16] Audit actions 追加", () => {
  it("AUDIT_OUTBOX_STUCK_RECOVERED が定義されている", async () => {
    const { AUDIT_OUTBOX_STUCK_RECOVERED } = await import("@/audit/actions");
    expect(AUDIT_OUTBOX_STUCK_RECOVERED.action).toBe("recover");
    expect(AUDIT_OUTBOX_STUCK_RECOVERED.resourceType).toBe("outbox_event");
  });
});

// ────────────────────────────────────────────────────────────
// Smoke 6: route imports が解決できること
// ────────────────────────────────────────────────────────────

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn(async () => ({
    session: { user: { id: 1, role: "platform_admin" } },
    runInContext: async (fn: () => unknown) => fn(),
  })),
}));
vi.mock("@/features/platform-outbox", () => ({
  runOutboxHealthCheck: vi.fn().mockResolvedValue({
    summary: { pendingCount: 0, failedCount: 0, deadCount: 0, processingCount: 0, sentCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0, retryableFailedCount: 0, oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [] },
    alerts: [],
    metricsPublished: false,
    notificationsSent: false,
    notificationReasons: [],
    status: "healthy",
    suppressedByCooldown: false,
  }),
  recoverStuckEventsAndReport: vi.fn().mockResolvedValue({
    recovery: { scannedCount: 0, recoveredCount: 0, skippedCount: 0, dryRun: true, recoveredIds: [], skippedIds: [] },
    healthCheck: { metricsPublished: false, notificationsSent: false, notificationReasons: [], status: "healthy", suppressedByCooldown: false },
  }),
}));
vi.mock("@/features/platform-outbox-recovery", () => ({
  listRecoverableStuckEvents: vi.fn().mockResolvedValue([]),
  recoverStuckOutboxEvents: vi.fn(),
  countRecoverableStuckOutboxEvents: vi.fn(),
}));

import { NextRequest } from "next/server";

describe("[Phase 16] route imports と基本動作", () => {
  it("health-check route が POST をエクスポートしている", async () => {
    const mod = await import("@/app/api/platform/outbox/health-check/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("recover-stuck route が POST をエクスポートしている", async () => {
    const mod = await import("@/app/api/platform/outbox/recover-stuck/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("recoverable-stuck route が GET をエクスポートしている", async () => {
    const mod = await import("@/app/api/platform/outbox/recoverable-stuck/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("health-check が 200 を返す", async () => {
    const { POST } = await import("@/app/api/platform/outbox/health-check/route");
    const res = await POST(new NextRequest("http://localhost/", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("recoverable-stuck が 200 を返す", async () => {
    const { GET } = await import("@/app/api/platform/outbox/recoverable-stuck/route");
    const res = await GET(new NextRequest("http://localhost/api/platform/outbox/recoverable-stuck", { method: "GET" }));
    expect(res.status).toBe(200);
  });
});
