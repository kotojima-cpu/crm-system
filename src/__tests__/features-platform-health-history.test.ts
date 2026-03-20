/**
 * platform-health-history テスト
 *
 * determineHealthCheckStatus, saveHealthCheckHistory, listHealthCheckHistory,
 * getLatestHealthCheckHistory の仕様を検証
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock("@/shared/db", () => ({
  prisma: {
    platformHealthCheckHistory: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import {
  determineHealthCheckStatus,
  saveHealthCheckHistory,
  listHealthCheckHistory,
  getLatestHealthCheckHistory,
} from "@/features/platform-health-history/service";
import type { OutboxOperationalAlert } from "@/features/platform-outbox/types";
import type { OutboxSummary } from "@/features/platform-outbox/types";

function makeAlerts(...codes: Array<"DEAD_EVENTS_EXIST" | "STUCK_PROCESSING" | "FAILED_EVENTS_HIGH">): OutboxOperationalAlert[] {
  return codes.map((code) => ({ level: "warning" as const, code, count: 1 }));
}

function makeSummary(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return {
    pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 0, sentCount: 0,
    retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
    oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// determineHealthCheckStatus
// ────────────────────────────────────────────────────────────

describe("determineHealthCheckStatus", () => {
  it("アラートなし → healthy", () => {
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

  it("DEAD_EVENTS_EXIST と FAILED_EVENTS_HIGH → critical", () => {
    expect(determineHealthCheckStatus(makeAlerts("DEAD_EVENTS_EXIST", "FAILED_EVENTS_HIGH"))).toBe("critical");
  });
});

// ────────────────────────────────────────────────────────────
// saveHealthCheckHistory
// ────────────────────────────────────────────────────────────

describe("saveHealthCheckHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DB にレコードを作成して返す", async () => {
    const now = new Date();
    mockCreate.mockResolvedValue({
      id: 1,
      summaryJson: "{}",
      alertCodesJson: "[]",
      metricsPublished: true,
      notificationsSent: false,
      suppressedByCooldown: false,
      createdAt: now,
    });

    const result = await saveHealthCheckHistory({
      summary: makeSummary(),
      alerts: [],
      metricsPublished: true,
      notificationsSent: false,
      suppressedByCooldown: false,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
    expect(result?.metricsPublished).toBe(true);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("DB エラーでも null を返す（best-effort）", async () => {
    mockCreate.mockRejectedValue(new Error("db error"));
    const result = await saveHealthCheckHistory({
      summary: makeSummary(),
      alerts: [],
      metricsPublished: false,
      notificationsSent: false,
      suppressedByCooldown: false,
    });
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// listHealthCheckHistory
// ────────────────────────────────────────────────────────────

describe("listHealthCheckHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("履歴一覧を返す", async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      { id: 1, summaryJson: "{}", alertCodesJson: "[]", metricsPublished: true, notificationsSent: false, suppressedByCooldown: false, createdAt: now },
      { id: 2, summaryJson: "{}", alertCodesJson: "[]", metricsPublished: false, notificationsSent: false, suppressedByCooldown: true, createdAt: now },
    ]);

    const items = await listHealthCheckHistory(20);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe(1);
    expect(items[1].suppressedByCooldown).toBe(true);
  });

  it("空の場合は空配列", async () => {
    mockFindMany.mockResolvedValue([]);
    const items = await listHealthCheckHistory();
    expect(items).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// getLatestHealthCheckHistory
// ────────────────────────────────────────────────────────────

describe("getLatestHealthCheckHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("最新レコードを返す", async () => {
    const now = new Date();
    mockFindFirst.mockResolvedValue({
      id: 5, summaryJson: "{}", alertCodesJson: '["DEAD_EVENTS_EXIST"]',
      metricsPublished: true, notificationsSent: true, suppressedByCooldown: false, createdAt: now,
    });

    const result = await getLatestHealthCheckHistory();
    expect(result).not.toBeNull();
    expect(result?.id).toBe(5);
    expect(result?.alertCodesJson).toBe('["DEAD_EVENTS_EXIST"]');
  });

  it("レコードなしの場合は null", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await getLatestHealthCheckHistory();
    expect(result).toBeNull();
  });
});
