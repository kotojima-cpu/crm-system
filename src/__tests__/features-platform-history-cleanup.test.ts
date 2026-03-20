/**
 * platform history cleanup テスト
 *
 * cleanupOldPlatformAlertHistory / cleanupOldPlatformHealthHistory の仕様を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockAlertDeleteMany, mockHealthDeleteMany } = vi.hoisted(() => ({
  mockAlertDeleteMany: vi.fn(),
  mockHealthDeleteMany: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  prisma: {
    platformAlertHistory: { deleteMany: mockAlertDeleteMany },
    platformHealthCheckHistory: { deleteMany: mockHealthDeleteMany },
  },
}));

import { cleanupOldPlatformAlertHistory } from "@/features/platform-alert-history/cleanup";
import { cleanupOldPlatformHealthHistory } from "@/features/platform-health-history/cleanup";

describe("cleanupOldPlatformAlertHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deleteMany が呼ばれ count を返す", async () => {
    mockAlertDeleteMany.mockResolvedValue({ count: 5 });
    const count = await cleanupOldPlatformAlertHistory();
    expect(count).toBe(5);
    expect(mockAlertDeleteMany).toHaveBeenCalledOnce();
  });

  it("where.lastSentAt.lt が 30 日前より前の Date になる", async () => {
    mockAlertDeleteMany.mockResolvedValue({ count: 0 });
    const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await cleanupOldPlatformAlertHistory(30);
    const { where } = mockAlertDeleteMany.mock.calls[0][0];
    const threshold: Date = where.lastSentAt.lt;
    // threshold は before から ±5秒以内
    expect(Math.abs(threshold.getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("retentionDays=7 → 7日前の閾値になる", async () => {
    mockAlertDeleteMany.mockResolvedValue({ count: 2 });
    const before = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await cleanupOldPlatformAlertHistory(7);
    const { where } = mockAlertDeleteMany.mock.calls[0][0];
    expect(Math.abs(where.lastSentAt.lt.getTime() - before.getTime())).toBeLessThan(5000);
  });
});

describe("cleanupOldPlatformHealthHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deleteMany が呼ばれ count を返す", async () => {
    mockHealthDeleteMany.mockResolvedValue({ count: 3 });
    const count = await cleanupOldPlatformHealthHistory();
    expect(count).toBe(3);
    expect(mockHealthDeleteMany).toHaveBeenCalledOnce();
  });

  it("where.createdAt.lt が 30 日前の Date になる", async () => {
    mockHealthDeleteMany.mockResolvedValue({ count: 0 });
    const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await cleanupOldPlatformHealthHistory(30);
    const { where } = mockHealthDeleteMany.mock.calls[0][0];
    expect(Math.abs(where.createdAt.lt.getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("count=0 も正しく返す", async () => {
    mockHealthDeleteMany.mockResolvedValue({ count: 0 });
    expect(await cleanupOldPlatformHealthHistory()).toBe(0);
  });
});
