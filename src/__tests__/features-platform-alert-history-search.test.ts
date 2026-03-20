/**
 * platform-alert-history listPlatformAlertHistory 検索テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany } = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  return { mockFindMany };
});

vi.mock("@/shared/db", () => ({
  prisma: {
    platformAlertHistory: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { listPlatformAlertHistory } from "@/features/platform-alert-history";

const baseRecord = {
  id: 1,
  alertKey: "DEAD_EVENTS_EXIST",
  channel: "webhook",
  lastSentAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("listPlatformAlertHistory — alertKeyContains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([baseRecord]);
  });

  it("alertKeyContains is passed to where.alertKey.contains", async () => {
    await listPlatformAlertHistory({ alertKeyContains: "DEAD" });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alertKey: { contains: "DEAD" },
        }),
      }),
    );
  });

  it("channel + alertKeyContains combined", async () => {
    await listPlatformAlertHistory({ channel: "webhook", alertKeyContains: "STUCK" });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "webhook",
          alertKey: { contains: "STUCK" },
        }),
      }),
    );
  });

  it("limit clamp to 100", async () => {
    await listPlatformAlertHistory({ limit: 999 });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("no alertKeyContains → no alertKey in where", async () => {
    await listPlatformAlertHistory({ channel: "mail" });
    const call = mockFindMany.mock.calls[0][0];
    // where should not contain alertKey key
    expect(call.where?.alertKey).toBeUndefined();
  });
});
