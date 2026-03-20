/**
 * platform-outbox monitoring テスト
 *
 * publishOutboxMetrics の動作を検証。
 * - 正常系: メトリクス発行
 * - 異常系: publisher 内部エラーでも例外が伝播しない（best-effort）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));
vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));

// メトリクス publisher モック
const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockPublishMany = vi.fn().mockResolvedValue(undefined);

vi.mock("@/infrastructure/factory", () => ({
  createMetricsPublisher: () => ({
    publish: mockPublish,
    publishMany: mockPublishMany,
  }),
}));

import type { OutboxSummary } from "@/features/platform-outbox/types";

function makeSummary(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return {
    pendingCount: 3,
    processingCount: 1,
    failedCount: 2,
    deadCount: 0,
    sentCount: 100,
    retryableFailedCount: 2,
    stuckProcessingCount: 0,
    recoverableStuckCount: 0,
    oldestPendingCreatedAt: new Date("2026-03-17T00:00:00Z"),
    oldestFailedCreatedAt: null,
    recentErrorSamples: [],
    ...overrides,
  };
}

describe("publishOutboxMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("OutboxSummary の各カウントをメトリクスとして発行する", async () => {
    const { publishOutboxMetrics } = await import("@/features/platform-outbox/monitoring");
    const summary = makeSummary({ pendingCount: 5, failedCount: 3, deadCount: 2 });

    await publishOutboxMetrics(summary);

    expect(mockPublishMany).toHaveBeenCalledOnce();
    const metrics = mockPublishMany.mock.calls[0][0] as Array<{ name: string; value: number }>;

    const pending  = metrics.find((m) => m.name === "OutboxEventsPending");
    const failed   = metrics.find((m) => m.name === "OutboxEventsFailed");
    const dead     = metrics.find((m) => m.name === "OutboxEventsDead");
    const stuck    = metrics.find((m) => m.name === "OutboxStuckProcessingCount");

    expect(pending?.value).toBe(5);
    expect(failed?.value).toBe(3);
    expect(dead?.value).toBe(2);
    expect(stuck?.value).toBe(0);
  });

  it("unit が Count であること", async () => {
    const { publishOutboxMetrics } = await import("@/features/platform-outbox/monitoring");
    await publishOutboxMetrics(makeSummary());

    const metrics = mockPublishMany.mock.calls[0][0] as Array<{ unit: string }>;
    expect(metrics.every((m) => m.unit === "Count")).toBe(true);
  });

  it("publishMany が例外を throw しても呼び出し元に伝播しない（best-effort）", async () => {
    mockPublishMany.mockRejectedValueOnce(new Error("CloudWatch unreachable"));

    const { publishOutboxMetrics } = await import("@/features/platform-outbox/monitoring");
    await expect(publishOutboxMetrics(makeSummary())).resolves.not.toThrow();
  });

  it("createMetricsPublisher が例外を throw しても呼び出し元に伝播しない", async () => {
    vi.doMock("@/infrastructure/factory", () => ({
      createMetricsPublisher: () => {
        throw new Error("factory error");
      },
    }));

    // モジュールキャッシュをクリアして再インポート
    const mod = await import("@/features/platform-outbox/monitoring");
    await expect(mod.publishOutboxMetrics(makeSummary())).resolves.not.toThrow();

    // 元に戻す
    vi.doMock("@/infrastructure/factory", () => ({
      createMetricsPublisher: () => ({
        publish: mockPublish,
        publishMany: mockPublishMany,
      }),
    }));
  });
});
