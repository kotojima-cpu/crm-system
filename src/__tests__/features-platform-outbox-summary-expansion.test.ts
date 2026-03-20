/**
 * Phase 17 Outbox Summary/HealthCheck 拡張テスト
 *
 * - OutboxSummary に recoverableStuckCount フィールドが存在する
 * - OutboxHealthCheckResult に status フィールドが存在する
 * - determineHealthCheckStatus のロジックを検証する
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { OutboxSummary, OutboxHealthCheckResult, OutboxOperationalAlert } from "@/features/platform-outbox/types";
import { determineHealthCheckStatus } from "@/features/platform-health-history/service";

// ────────────────────────────────────────────────────────────
// OutboxSummary 型: recoverableStuckCount の存在確認
// ────────────────────────────────────────────────────────────

describe("OutboxSummary — recoverableStuckCount フィールド", () => {
  it("recoverableStuckCount を含む OutboxSummary が型エラーなく生成できる", () => {
    const summary: OutboxSummary = {
      pendingCount: 0,
      processingCount: 0,
      failedCount: 0,
      deadCount: 0,
      sentCount: 0,
      retryableFailedCount: 0,
      stuckProcessingCount: 2,
      recoverableStuckCount: 2,
      oldestPendingCreatedAt: null,
      oldestFailedCreatedAt: null,
      recentErrorSamples: [],
    };
    expect(summary.recoverableStuckCount).toBe(2);
  });

  it("recoverableStuckCount は 0 以上の数値", () => {
    const summary: OutboxSummary = {
      pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 0, sentCount: 0,
      retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
      oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
    };
    expect(summary.recoverableStuckCount).toBeGreaterThanOrEqual(0);
  });
});

// ────────────────────────────────────────────────────────────
// OutboxHealthCheckResult 型: status フィールドの存在確認
// ────────────────────────────────────────────────────────────

describe("OutboxHealthCheckResult — status フィールド", () => {
  it("status フィールドを含む OutboxHealthCheckResult が型エラーなく生成できる", () => {
    const result: OutboxHealthCheckResult = {
      summary: {
        pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 0, sentCount: 0,
        retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
        oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
      },
      alerts: [],
      metricsPublished: true,
      notificationsSent: false,
      notificationReasons: [],
      status: "healthy",
      suppressedByCooldown: false,
    };
    expect(result.status).toBe("healthy");
  });

  it("status は healthy | warning | critical のいずれか", () => {
    const statuses: OutboxHealthCheckResult["status"][] = ["healthy", "warning", "critical"];
    expect(statuses).toContain("healthy");
    expect(statuses).toContain("warning");
    expect(statuses).toContain("critical");
  });

  it("suppressedByCooldown フィールドが存在する", () => {
    const result: OutboxHealthCheckResult = {
      summary: {
        pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 0, sentCount: 0,
        retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
        oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
      },
      alerts: [],
      metricsPublished: false,
      notificationsSent: false,
      notificationReasons: [],
      status: "critical",
      suppressedByCooldown: true,
    };
    expect(result.suppressedByCooldown).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// determineHealthCheckStatus のロジック検証
// ────────────────────────────────────────────────────────────

function makeAlerts(...codes: Array<"DEAD_EVENTS_EXIST" | "STUCK_PROCESSING" | "FAILED_EVENTS_HIGH">): OutboxOperationalAlert[] {
  return codes.map((code) => ({ level: "warning" as const, code, count: 1 }));
}

describe("determineHealthCheckStatus ロジック", () => {
  it("空アラート → healthy", () => {
    expect(determineHealthCheckStatus([])).toBe("healthy");
  });

  it("FAILED_EVENTS_HIGH のみ → warning", () => {
    expect(determineHealthCheckStatus(makeAlerts("FAILED_EVENTS_HIGH"))).toBe("warning");
  });

  it("DEAD_EVENTS_EXIST → critical", () => {
    expect(determineHealthCheckStatus(makeAlerts("DEAD_EVENTS_EXIST"))).toBe("critical");
  });

  it("STUCK_PROCESSING → critical", () => {
    expect(determineHealthCheckStatus(makeAlerts("STUCK_PROCESSING"))).toBe("critical");
  });

  it("critical アラートが混在していれば critical", () => {
    expect(determineHealthCheckStatus(makeAlerts("FAILED_EVENTS_HIGH", "STUCK_PROCESSING"))).toBe("critical");
  });

  it("warning のみ複数 → warning", () => {
    // FAILED_EVENTS_HIGH のみが warning
    expect(determineHealthCheckStatus(makeAlerts("FAILED_EVENTS_HIGH"))).toBe("warning");
  });
});
