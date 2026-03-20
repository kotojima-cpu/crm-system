/**
 * platform-alert-history テスト
 *
 * buildAlertDedupKey, shouldSendPlatformAlert, markPlatformAlertSent の仕様を検証
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/shared/db", () => ({
  prisma: {
    platformAlertHistory: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import {
  buildAlertDedupKey,
  shouldSendPlatformAlert,
  markPlatformAlertSent,
} from "@/features/platform-alert-history/service";
import type { OutboxOperationalAlert } from "@/features/platform-outbox/types";

function makeAlerts(...codes: Array<"DEAD_EVENTS_EXIST" | "STUCK_PROCESSING" | "FAILED_EVENTS_HIGH">): OutboxOperationalAlert[] {
  return codes.map((code) => ({ level: "warning" as const, code, count: 1 }));
}

// ────────────────────────────────────────────────────────────
// buildAlertDedupKey
// ────────────────────────────────────────────────────────────

describe("buildAlertDedupKey", () => {
  it("単一アラートのキーを生成する", () => {
    const key = buildAlertDedupKey(makeAlerts("DEAD_EVENTS_EXIST"));
    expect(key).toBe("DEAD_EVENTS_EXIST");
  });

  it("複数アラートをソートして結合する", () => {
    const key = buildAlertDedupKey(makeAlerts("STUCK_PROCESSING", "DEAD_EVENTS_EXIST"));
    // ソート済みなので DEAD_EVENTS_EXIST が先に来る
    expect(key).toBe("DEAD_EVENTS_EXIST|STUCK_PROCESSING");
  });

  it("順序が違っても同じキーになる", () => {
    const key1 = buildAlertDedupKey(makeAlerts("FAILED_EVENTS_HIGH", "DEAD_EVENTS_EXIST"));
    const key2 = buildAlertDedupKey(makeAlerts("DEAD_EVENTS_EXIST", "FAILED_EVENTS_HIGH"));
    expect(key1).toBe(key2);
  });

  it("空のアラート配列は空文字を返す", () => {
    const key = buildAlertDedupKey([]);
    expect(key).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// shouldSendPlatformAlert
// ────────────────────────────────────────────────────────────

describe("shouldSendPlatformAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("履歴なし → true（送信許可）", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await shouldSendPlatformAlert("DEAD_EVENTS_EXIST", "webhook");
    expect(result).toBe(true);
  });

  it("cooldown 内に送信済み → false（抑制）", async () => {
    // lastSentAt が1分前（cooldown 60分未満）
    mockFindUnique.mockResolvedValue({ lastSentAt: new Date(Date.now() - 60 * 1000) });
    const result = await shouldSendPlatformAlert("DEAD_EVENTS_EXIST", "webhook", 60);
    expect(result).toBe(false);
  });

  it("cooldown 経過後 → true（送信許可）", async () => {
    // lastSentAt が 61 分前
    mockFindUnique.mockResolvedValue({ lastSentAt: new Date(Date.now() - 61 * 60 * 1000) });
    const result = await shouldSendPlatformAlert("DEAD_EVENTS_EXIST", "webhook", 60);
    expect(result).toBe(true);
  });

  it("DB エラー → true（フォールバック）", async () => {
    mockFindUnique.mockRejectedValue(new Error("db error"));
    const result = await shouldSendPlatformAlert("key", "mail");
    expect(result).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// markPlatformAlertSent
// ────────────────────────────────────────────────────────────

describe("markPlatformAlertSent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsert を呼ぶ", async () => {
    mockUpsert.mockResolvedValue({});
    await markPlatformAlertSent("DEAD_EVENTS_EXIST", "webhook");
    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0] as { where: { alertKey_channel: { alertKey: string; channel: string } } };
    expect(call.where.alertKey_channel.alertKey).toBe("DEAD_EVENTS_EXIST");
    expect(call.where.alertKey_channel.channel).toBe("webhook");
  });

  it("DB エラーでも throw しない（best-effort）", async () => {
    mockUpsert.mockRejectedValue(new Error("upsert failed"));
    await expect(markPlatformAlertSent("key", "mail")).resolves.toBeUndefined();
  });
});
