/**
 * platform-health-history presenters テスト
 *
 * parseHealthHistorySummary, parseHealthHistoryAlertCodes の仕様を検証する。
 */

import { describe, it, expect } from "vitest";
import {
  parseHealthHistorySummary,
  parseHealthHistoryAlertCodes,
} from "@/features/platform-health-history/presenters";
import type { PlatformHealthCheckHistoryRecord } from "@/features/platform-health-history/types";

function makeRecord(overrides: Partial<PlatformHealthCheckHistoryRecord> = {}): PlatformHealthCheckHistoryRecord {
  return {
    id: 1,
    summaryJson: "{}",
    alertCodesJson: "[]",
    metricsPublished: true,
    notificationsSent: false,
    suppressedByCooldown: false,
    createdAt: new Date("2026-03-17T10:00:00Z"),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// parseHealthHistorySummary
// ────────────────────────────────────────────────────────────

describe("parseHealthHistorySummary", () => {
  it("正常 JSON を parse して返す", () => {
    const summary = {
      pendingCount: 2,
      processingCount: 0,
      failedCount: 1,
      deadCount: 0,
      sentCount: 100,
      retryableFailedCount: 1,
      stuckProcessingCount: 0,
      recoverableStuckCount: 0,
      oldestPendingCreatedAt: null,
      oldestFailedCreatedAt: null,
      recentErrorSamples: [],
    };
    const record = makeRecord({ summaryJson: JSON.stringify(summary) });
    const result = parseHealthHistorySummary(record);
    expect(result).not.toBeNull();
    expect(result?.pendingCount).toBe(2);
    expect(result?.failedCount).toBe(1);
  });

  it("壊れた JSON → null を返す", () => {
    const record = makeRecord({ summaryJson: "{ broken json" });
    expect(parseHealthHistorySummary(record)).toBeNull();
  });

  it("空の JSON オブジェクト → 空オブジェクトが返る", () => {
    const record = makeRecord({ summaryJson: "{}" });
    const result = parseHealthHistorySummary(record);
    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────
// parseHealthHistoryAlertCodes
// ────────────────────────────────────────────────────────────

describe("parseHealthHistoryAlertCodes", () => {
  it("正常な配列 JSON → 配列を返す", () => {
    const record = makeRecord({
      alertCodesJson: JSON.stringify(["DEAD_EVENTS_EXIST", "STUCK_PROCESSING"]),
    });
    const result = parseHealthHistoryAlertCodes(record);
    expect(result).toEqual(["DEAD_EVENTS_EXIST", "STUCK_PROCESSING"]);
  });

  it("空配列 → [] を返す", () => {
    const record = makeRecord({ alertCodesJson: "[]" });
    expect(parseHealthHistoryAlertCodes(record)).toEqual([]);
  });

  it("壊れた JSON → [] を返す", () => {
    const record = makeRecord({ alertCodesJson: "not json" });
    expect(parseHealthHistoryAlertCodes(record)).toEqual([]);
  });

  it("配列でない JSON（オブジェクト）→ [] を返す", () => {
    const record = makeRecord({ alertCodesJson: '{"key":"value"}' });
    expect(parseHealthHistoryAlertCodes(record)).toEqual([]);
  });
});
