/**
 * platform-history-dashboard service テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockGetLatest, mockDetermineStatus } = vi.hoisted(() => {
  const mockPrisma = {
    platformAlertHistory: {
      count: vi.fn(),
    },
    platformHealthCheckHistory: {
      count: vi.fn(),
    },
  };
  const mockGetLatest = vi.fn();
  const mockDetermineStatus = vi.fn();
  return { mockPrisma, mockGetLatest, mockDetermineStatus };
});

vi.mock("@/shared/db", () => ({ prisma: mockPrisma }));
vi.mock("@/features/platform-health-history", () => ({
  getLatestHealthCheckHistory: (...args: unknown[]) => mockGetLatest(...args),
  determineHealthCheckStatusFromCodes: (...args: unknown[]) => mockDetermineStatus(...args),
}));

import { getPlatformHistoryDashboardSummary } from "@/features/platform-history-dashboard";

describe("getPlatformHistoryDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupCountMocks(
    alertTotal = 10,
    healthTotal = 5,
    webhookCount = 7,
    mailCount = 3,
    suppressedCount = 2,
  ) {
    mockPrisma.platformAlertHistory.count
      .mockResolvedValueOnce(alertTotal)
      .mockResolvedValueOnce(webhookCount)
      .mockResolvedValueOnce(mailCount);
    mockPrisma.platformHealthCheckHistory.count
      .mockResolvedValueOnce(healthTotal)
      .mockResolvedValueOnce(suppressedCount);
  }

  it("returns correct counts from prisma", async () => {
    setupCountMocks(10, 5, 7, 3, 2);
    mockGetLatest.mockResolvedValue(null);
    mockDetermineStatus.mockReturnValue("healthy");

    const result = await getPlatformHistoryDashboardSummary();

    expect(result.alertHistoryCount).toBe(10);
    expect(result.healthHistoryCount).toBe(5);
    expect(result.webhookAlertCount).toBe(7);
    expect(result.mailAlertCount).toBe(3);
    expect(result.suppressedHealthCheckCount).toBe(2);
  });

  it("latestHealthStatus = 'critical' when alertCodes contains DEAD_EVENTS_EXIST", async () => {
    setupCountMocks();
    const latest = {
      id: 1,
      alertCodesJson: JSON.stringify(["DEAD_EVENTS_EXIST"]),
      createdAt: new Date("2026-03-17T10:00:00Z"),
      summaryJson: "{}",
      metricsPublished: true,
      notificationsSent: true,
      suppressedByCooldown: false,
    };
    mockGetLatest.mockResolvedValue(latest);
    mockDetermineStatus.mockReturnValue("critical");

    const result = await getPlatformHistoryDashboardSummary();

    expect(result.latestHealthStatus).toBe("critical");
    expect(mockDetermineStatus).toHaveBeenCalledWith(["DEAD_EVENTS_EXIST"]);
  });

  it("latestHealthStatus = 'unknown' when latest is null", async () => {
    setupCountMocks();
    mockGetLatest.mockResolvedValue(null);

    const result = await getPlatformHistoryDashboardSummary();

    expect(result.latestHealthStatus).toBe("unknown");
  });

  it("latestHealthCheckAt = null when latest is null", async () => {
    setupCountMocks();
    mockGetLatest.mockResolvedValue(null);

    const result = await getPlatformHistoryDashboardSummary();

    expect(result.latestHealthCheckAt).toBeNull();
  });

  it("latestHealthCheckAt = createdAt when latest exists", async () => {
    const createdAt = new Date("2026-03-17T10:00:00Z");
    setupCountMocks();
    const latest = {
      id: 1,
      alertCodesJson: JSON.stringify([]),
      createdAt,
      summaryJson: "{}",
      metricsPublished: true,
      notificationsSent: false,
      suppressedByCooldown: false,
    };
    mockGetLatest.mockResolvedValue(latest);
    mockDetermineStatus.mockReturnValue("healthy");

    const result = await getPlatformHistoryDashboardSummary();

    expect(result.latestHealthCheckAt).toBe(createdAt);
  });
});
