/**
 * platform-history-maintenance service テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCleanupAlert, mockCleanupHealth } = vi.hoisted(() => {
  const mockCleanupAlert = vi.fn();
  const mockCleanupHealth = vi.fn();
  return { mockCleanupAlert, mockCleanupHealth };
});

vi.mock("@/features/platform-alert-history", () => ({
  cleanupOldPlatformAlertHistory: (...args: unknown[]) => mockCleanupAlert(...args),
}));
vi.mock("@/features/platform-health-history", () => ({
  cleanupOldPlatformHealthHistory: (...args: unknown[]) => mockCleanupHealth(...args),
}));
vi.mock("@/shared/errors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/errors")>();
  return actual;
});

import { cleanupPlatformHistory } from "@/features/platform-history-maintenance";
import { ValidationError } from "@/shared/errors";

describe("cleanupPlatformHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanupAlert.mockResolvedValue(5);
    mockCleanupHealth.mockResolvedValue(3);
  });

  it("default retentionDays=30", async () => {
    const result = await cleanupPlatformHistory();
    expect(result.retentionDays).toBe(30);
    expect(mockCleanupAlert).toHaveBeenCalledWith(30);
    expect(mockCleanupHealth).toHaveBeenCalledWith(30);
  });

  it("returns correct counts", async () => {
    mockCleanupAlert.mockResolvedValue(12);
    mockCleanupHealth.mockResolvedValue(8);

    const result = await cleanupPlatformHistory(30);

    expect(result.alertHistoryDeletedCount).toBe(12);
    expect(result.healthHistoryDeletedCount).toBe(8);
    expect(result.retentionDays).toBe(30);
  });

  it("retentionDays=0 → ValidationError", async () => {
    await expect(cleanupPlatformHistory(0)).rejects.toThrow(ValidationError);
  });

  it("retentionDays=366 → ValidationError", async () => {
    await expect(cleanupPlatformHistory(366)).rejects.toThrow(ValidationError);
  });

  it("retentionDays=1 → valid", async () => {
    const result = await cleanupPlatformHistory(1);
    expect(result.retentionDays).toBe(1);
  });

  it("retentionDays=365 → valid", async () => {
    const result = await cleanupPlatformHistory(365);
    expect(result.retentionDays).toBe(365);
  });

  it("non-integer (1.5) → ValidationError", async () => {
    await expect(cleanupPlatformHistory(1.5)).rejects.toThrow(ValidationError);
  });
});
