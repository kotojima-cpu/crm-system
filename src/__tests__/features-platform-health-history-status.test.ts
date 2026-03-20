/**
 * platform-health-history status テスト
 *
 * determineHealthCheckStatusFromCodes の仕様を検証する:
 * - DEAD_EVENTS_EXIST → critical
 * - STUCK_PROCESSING → critical
 * - その他コードのみ → warning
 * - 空 → healthy
 * - 混在（critical + warning） → critical
 */

import { describe, it, expect } from "vitest";
import {
  determineHealthCheckStatus,
  determineHealthCheckStatusFromCodes,
} from "@/features/platform-health-history/service";
import type { OutboxOperationalAlert } from "@/features/platform-outbox/types";

describe("determineHealthCheckStatusFromCodes", () => {
  it("空配列 → healthy", () => {
    expect(determineHealthCheckStatusFromCodes([])).toBe("healthy");
  });

  it("DEAD_EVENTS_EXIST → critical", () => {
    expect(determineHealthCheckStatusFromCodes(["DEAD_EVENTS_EXIST"])).toBe("critical");
  });

  it("STUCK_PROCESSING → critical", () => {
    expect(determineHealthCheckStatusFromCodes(["STUCK_PROCESSING"])).toBe("critical");
  });

  it("FAILED_EVENTS_HIGH のみ → warning", () => {
    expect(determineHealthCheckStatusFromCodes(["FAILED_EVENTS_HIGH"])).toBe("warning");
  });

  it("DEAD_EVENTS_EXIST + FAILED_EVENTS_HIGH → critical（critical 優先）", () => {
    expect(
      determineHealthCheckStatusFromCodes(["DEAD_EVENTS_EXIST", "FAILED_EVENTS_HIGH"]),
    ).toBe("critical");
  });

  it("未知コードのみ → warning（code あり）", () => {
    expect(determineHealthCheckStatusFromCodes(["UNKNOWN_CODE"])).toBe("warning");
  });
});

describe("determineHealthCheckStatus（OutboxOperationalAlert[] 版）", () => {
  it("alerts なし → healthy", () => {
    expect(determineHealthCheckStatus([])).toBe("healthy");
  });

  it("DEAD_EVENTS_EXIST → critical", () => {
    const alerts: OutboxOperationalAlert[] = [
      { level: "warning", code: "DEAD_EVENTS_EXIST", count: 1 },
    ];
    expect(determineHealthCheckStatus(alerts)).toBe("critical");
  });

  it("STUCK_PROCESSING → critical", () => {
    const alerts: OutboxOperationalAlert[] = [
      { level: "warning", code: "STUCK_PROCESSING", count: 2 },
    ];
    expect(determineHealthCheckStatus(alerts)).toBe("critical");
  });

  it("FAILED_EVENTS_HIGH のみ → warning", () => {
    const alerts: OutboxOperationalAlert[] = [
      { level: "warning", code: "FAILED_EVENTS_HIGH", count: 15 },
    ];
    expect(determineHealthCheckStatus(alerts)).toBe("warning");
  });
});

describe("determineHealthCheckStatusFromCodes と determineHealthCheckStatus の一致", () => {
  it("同じ入力に対して同じ結果を返す", () => {
    const codes = ["DEAD_EVENTS_EXIST", "FAILED_EVENTS_HIGH"];
    const alerts: OutboxOperationalAlert[] = [
      { level: "warning", code: "DEAD_EVENTS_EXIST", count: 1 },
      { level: "warning", code: "FAILED_EVENTS_HIGH", count: 12 },
    ];
    expect(determineHealthCheckStatusFromCodes(codes)).toBe(
      determineHealthCheckStatus(alerts),
    );
  });
});
