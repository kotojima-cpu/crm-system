/**
 * Phase 19 smoke テスト
 *
 * 新規追加モジュールの export が正しいことを確認する。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/db", () => ({
  prisma: {
    platformAlertHistory: { findMany: vi.fn(), deleteMany: vi.fn() },
    platformHealthCheckHistory: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
  withPlatformTx: vi.fn(),
}));

describe("Phase 19 — platform-alert-history index exports", () => {
  it("listPlatformAlertHistory が export されている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(typeof mod.listPlatformAlertHistory).toBe("function");
  });

  it("splitAlertKey が export されている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(typeof mod.splitAlertKey).toBe("function");
  });

  it("formatAlertHistoryLabel が export されている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(typeof mod.formatAlertHistoryLabel).toBe("function");
  });

  it("cleanupOldPlatformAlertHistory が export されている", async () => {
    const mod = await import("@/features/platform-alert-history");
    expect(typeof mod.cleanupOldPlatformAlertHistory).toBe("function");
  });
});

describe("Phase 19 — platform-health-history index exports", () => {
  it("parseHealthHistorySummary が export されている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(typeof mod.parseHealthHistorySummary).toBe("function");
  });

  it("parseHealthHistoryAlertCodes が export されている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(typeof mod.parseHealthHistoryAlertCodes).toBe("function");
  });

  it("cleanupOldPlatformHealthHistory が export されている", async () => {
    const mod = await import("@/features/platform-health-history");
    expect(typeof mod.cleanupOldPlatformHealthHistory).toBe("function");
  });
});

describe("Phase 19 — alert-history route import", () => {
  it("GET handler が import できる", async () => {
    vi.mock("@/auth/guards", () => ({
      requirePlatformPermission: vi.fn(),
    }));
    vi.mock("@/auth/permissions", () => ({ Permission: { OUTBOX_READ: "OUTBOX_READ" } }));
    vi.mock("@/shared/errors", () => ({ toErrorResponse: vi.fn() }));

    const mod = await import("@/app/api/platform/outbox/alert-history/route");
    expect(typeof mod.GET).toBe("function");
  });
});

describe("Phase 19 — splitAlertKey / formatAlertHistoryLabel 動作確認", () => {
  it("splitAlertKey: 'A|B' → ['A', 'B']", async () => {
    const { splitAlertKey } = await import("@/features/platform-alert-history");
    expect(splitAlertKey("A|B")).toEqual(["A", "B"]);
  });

  it("formatAlertHistoryLabel: webhook channel の label", async () => {
    const { formatAlertHistoryLabel } = await import("@/features/platform-alert-history");
    const record = {
      id: 1, alertKey: "DEAD_EVENTS_EXIST", channel: "webhook" as const,
      lastSentAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    };
    expect(formatAlertHistoryLabel(record)).toBe("webhook: DEAD_EVENTS_EXIST");
  });
});
