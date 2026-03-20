/**
 * Phase 15 スモークテスト
 *
 * Phase 15 で追加・修正したコンポーネントが正常に動作することを確認。
 * - metrics abstraction の factory 切替
 * - outbox monitoring の publishOutboxMetrics
 * - webhook URL 検証
 * - permission 分離（outbox routes が操作別権限を使用）
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

// --- Smoke 1: MetricsPublisher factory ---

describe("[Phase 15] MetricsPublisher factory", () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  it("local モードで LocalMetricsPublisher が返る", async () => {
    process.env.INFRASTRUCTURE_MODE = "local";
    const { createMetricsPublisher } = await import("@/infrastructure/factory");
    const { LocalMetricsPublisher } = await import("@/infrastructure/metrics/local-metrics");
    expect(createMetricsPublisher()).toBeInstanceOf(LocalMetricsPublisher);
  });

  it("LocalMetricsPublisher.publishMany がメトリクスを保持する", async () => {
    const { LocalMetricsPublisher } = await import("@/infrastructure/metrics/local-metrics");
    const p = new LocalMetricsPublisher();
    await p.publishMany([
      { name: "OutboxEventsPending", value: 1, unit: "Count" },
      { name: "OutboxEventsDead",    value: 0, unit: "Count" },
    ]);
    expect(p.published).toHaveLength(2);
  });
});

// --- Smoke 2: publishOutboxMetrics best-effort ---

describe("[Phase 15] publishOutboxMetrics", () => {
  const mockPublishMany = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.doMock("@/infrastructure/factory", () => ({
      createMetricsPublisher: () => ({
        publish: vi.fn(),
        publishMany: mockPublishMany,
      }),
    }));
    vi.clearAllMocks();
  });

  it("OutboxSummary の 6 種メトリクスを発行する", async () => {
    const { publishOutboxMetrics } = await import("@/features/platform-outbox/monitoring");
    await publishOutboxMetrics({
      pendingCount: 2,
      processingCount: 0,
      failedCount: 1,
      deadCount: 1,
      sentCount: 50,
      retryableFailedCount: 1,
      stuckProcessingCount: 0,
      recoverableStuckCount: 0,
      oldestPendingCreatedAt: null,
      oldestFailedCreatedAt: null,
      recentErrorSamples: [],
    });
    expect(mockPublishMany).toHaveBeenCalledOnce();
    const sent = mockPublishMany.mock.calls[0][0] as Array<{ name: string }>;
    const names = sent.map((m) => m.name);
    expect(names).toContain("OutboxEventsPending");
    expect(names).toContain("OutboxEventsDead");
    expect(names).toContain("OutboxEventsFailed");
    expect(names).toContain("OutboxStuckProcessingCount");
  });

  it("publisher エラーでも resolve する", async () => {
    mockPublishMany.mockRejectedValueOnce(new Error("timeout"));
    const { publishOutboxMetrics } = await import("@/features/platform-outbox/monitoring");
    await expect(publishOutboxMetrics({
      pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 0,
      sentCount: 0, retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
      oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
    })).resolves.toBeUndefined();
  });
});

// --- Smoke 3: HttpWebhook URL 検証 ---

describe("[Phase 15] HttpWebhook URL 検証", () => {
  beforeEach(() => vi.clearAllMocks());

  it("不正な URL は retryable=false で失敗する", async () => {
    const { HttpWebhook } = await import("@/infrastructure/webhook/http-webhook");
    const webhook = new HttpWebhook();
    const result = await webhook.dispatch({
      endpoint: "not-a-url",
      eventType: "test.event",
      body: {},
      requestId: "req-test",
      tenantId: 1,
      actorUserId: 1,
      executionContext: "platform",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain("not-a-url");
    }
  });

  it("javascript: スキームは失敗する", async () => {
    const { HttpWebhook } = await import("@/infrastructure/webhook/http-webhook");
    const webhook = new HttpWebhook();
    const result = await webhook.dispatch({
      endpoint: "javascript:alert(1)",
      eventType: "test.event",
      body: {},
      requestId: "req-test",
      tenantId: 1,
      actorUserId: 1,
      executionContext: "platform",
    });
    expect(result.ok).toBe(false);
  });
});

// --- Smoke 4: Permission 分離確認 ---

describe("[Phase 15] Permission 分離", () => {
  it("OUTBOX_POLL_EXECUTE と BATCH_EXECUTE は別値", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.OUTBOX_POLL_EXECUTE).not.toBe(Permission.BATCH_EXECUTE);
  });

  it("OUTBOX_FORCE_REPLAY と OUTBOX_REPLAY は別値", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.OUTBOX_FORCE_REPLAY).not.toBe(Permission.OUTBOX_REPLAY);
  });

  it("platform_admin は全 6 outbox 権限を保持する", async () => {
    const { Permission, hasPermission } = await import("@/auth/permissions");
    const outboxPerms = [
      Permission.OUTBOX_READ,
      Permission.OUTBOX_RETRY,
      Permission.OUTBOX_REPLAY,
      Permission.OUTBOX_FORCE_REPLAY,
      Permission.OUTBOX_POLL_EXECUTE,
      Permission.MONITORING_READ,
    ];
    for (const p of outboxPerms) {
      expect(hasPermission("platform_admin", p)).toBe(true);
    }
  });

  it("tenant_admin は outbox 権限を持たない", async () => {
    const { Permission, hasPermission } = await import("@/auth/permissions");
    expect(hasPermission("tenant_admin", Permission.OUTBOX_READ)).toBe(false);
    expect(hasPermission("tenant_admin", Permission.OUTBOX_FORCE_REPLAY)).toBe(false);
  });
});
