/**
 * platform-alert-history list / presenters テスト
 *
 * listPlatformAlertHistory, splitAlertKey, formatAlertHistoryLabel の仕様を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  prisma: {
    platformAlertHistory: { findMany: mockFindMany },
  },
}));

import { listPlatformAlertHistory } from "@/features/platform-alert-history/repository";
import { splitAlertKey, formatAlertHistoryLabel } from "@/features/platform-alert-history/presenters";
import type { PlatformAlertHistoryRecord } from "@/features/platform-alert-history/types";

function makeRecord(overrides: Partial<PlatformAlertHistoryRecord> = {}): PlatformAlertHistoryRecord {
  return {
    id: 1,
    alertKey: "DEAD_EVENTS_EXIST",
    channel: "webhook",
    lastSentAt: new Date("2026-03-17T10:00:00Z"),
    createdAt: new Date("2026-03-17T10:00:00Z"),
    updatedAt: new Date("2026-03-17T10:00:00Z"),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// listPlatformAlertHistory
// ────────────────────────────────────────────────────────────

describe("listPlatformAlertHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("デフォルト limit=20 で findMany が呼ばれる", async () => {
    mockFindMany.mockResolvedValue([]);
    await listPlatformAlertHistory();
    const call = mockFindMany.mock.calls[0][0];
    expect(call.take).toBe(20);
    expect(call.where).toBeUndefined();
  });

  it("limit=5 を渡すと take=5 になる", async () => {
    mockFindMany.mockResolvedValue([]);
    await listPlatformAlertHistory({ limit: 5 });
    expect(mockFindMany.mock.calls[0][0].take).toBe(5);
  });

  it("limit=200 は 100 にクランプされる", async () => {
    mockFindMany.mockResolvedValue([]);
    await listPlatformAlertHistory({ limit: 200 });
    expect(mockFindMany.mock.calls[0][0].take).toBe(100);
  });

  it("channel=webhook を渡すと where に channel が入る", async () => {
    mockFindMany.mockResolvedValue([]);
    await listPlatformAlertHistory({ channel: "webhook" });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where).toEqual({ channel: "webhook" });
  });

  it("channel=mail を渡すと where に mail が入る", async () => {
    mockFindMany.mockResolvedValue([]);
    await listPlatformAlertHistory({ channel: "mail" });
    expect(mockFindMany.mock.calls[0][0].where).toEqual({ channel: "mail" });
  });

  it("レコードを PlatformAlertHistoryRecord にマップして返す", async () => {
    const raw = {
      id: 42,
      alertKey: "DEAD_EVENTS_EXIST|STUCK_PROCESSING",
      channel: "webhook",
      lastSentAt: new Date("2026-03-17T10:00:00Z"),
      createdAt: new Date("2026-03-17T09:00:00Z"),
      updatedAt: new Date("2026-03-17T10:00:00Z"),
    };
    mockFindMany.mockResolvedValue([raw]);
    const result = await listPlatformAlertHistory();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].alertKey).toBe("DEAD_EVENTS_EXIST|STUCK_PROCESSING");
    expect(result[0].channel).toBe("webhook");
  });
});

// ────────────────────────────────────────────────────────────
// splitAlertKey
// ────────────────────────────────────────────────────────────

describe("splitAlertKey", () => {
  it("単一コード → 1要素の配列", () => {
    expect(splitAlertKey("DEAD_EVENTS_EXIST")).toEqual(["DEAD_EVENTS_EXIST"]);
  });

  it("'A|B' → ['A', 'B']", () => {
    expect(splitAlertKey("DEAD_EVENTS_EXIST|STUCK_PROCESSING")).toEqual([
      "DEAD_EVENTS_EXIST",
      "STUCK_PROCESSING",
    ]);
  });

  it("空文字 → []", () => {
    expect(splitAlertKey("")).toEqual([]);
  });

  it("空白のみ → []", () => {
    expect(splitAlertKey("   ")).toEqual([]);
  });

  it("3つのコード → 3要素", () => {
    expect(splitAlertKey("A|B|C")).toEqual(["A", "B", "C"]);
  });
});

// ────────────────────────────────────────────────────────────
// formatAlertHistoryLabel
// ────────────────────────────────────────────────────────────

describe("formatAlertHistoryLabel", () => {
  it("webhook: DEAD_EVENTS_EXIST のラベル", () => {
    const record = makeRecord({ channel: "webhook", alertKey: "DEAD_EVENTS_EXIST" });
    expect(formatAlertHistoryLabel(record)).toBe("webhook: DEAD_EVENTS_EXIST");
  });

  it("mail: A, B の形式になる", () => {
    const record = makeRecord({ channel: "mail", alertKey: "DEAD_EVENTS_EXIST|STUCK_PROCESSING" });
    expect(formatAlertHistoryLabel(record)).toBe("mail: DEAD_EVENTS_EXIST, STUCK_PROCESSING");
  });

  it("空の alertKey → 'webhook: (empty)'", () => {
    const record = makeRecord({ channel: "webhook", alertKey: "" });
    expect(formatAlertHistoryLabel(record)).toBe("webhook: (empty)");
  });
});
