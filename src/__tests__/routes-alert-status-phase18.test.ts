/**
 * alert-status route Phase 18 テスト
 *
 * GET /api/platform/outbox/alert-status のレスポンスに status フィールドが含まれること。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/context", () => ({ getRequestContext: () => null }));

const mockGetLatest = vi.fn();
vi.mock("@/features/platform-health-history", () => ({
  getLatestHealthCheckHistory: (...args: unknown[]) => mockGetLatest(...args),
  determineHealthCheckStatusFromCodes: (codes: string[]) => {
    if (codes.some((c) => c === "DEAD_EVENTS_EXIST" || c === "STUCK_PROCESSING")) return "critical";
    if (codes.length > 0) return "warning";
    return "healthy";
  },
}));

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn().mockResolvedValue({
    runInContext: (fn: () => unknown) => fn(),
  }),
}));
vi.mock("@/auth/permissions", () => ({ Permission: { OUTBOX_READ: "OUTBOX_READ" } }));
vi.mock("@/shared/errors", () => ({
  toErrorResponse: (e: unknown) => ({ error: e }),
}));

import { GET } from "@/app/api/platform/outbox/alert-status/route";

function makeRequest(url = "http://localhost/api/platform/outbox/alert-status") {
  return { url } as unknown as import("next/server").NextRequest;
}

describe("GET /api/platform/outbox/alert-status (Phase 18)", () => {
  it("履歴なし → status=healthy, alertCodes=[], lastHealthCheckAt=null", async () => {
    mockGetLatest.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("healthy");
    expect(body.data.alertCodes).toEqual([]);
    expect(body.data.lastHealthCheckAt).toBeNull();
    expect(body.data.suppressedByCooldown).toBe(false);
  });

  it("DEAD_EVENTS_EXIST のある履歴 → status=critical", async () => {
    mockGetLatest.mockResolvedValue({
      id: 1,
      alertCodesJson: JSON.stringify(["DEAD_EVENTS_EXIST"]),
      suppressedByCooldown: false,
      createdAt: new Date("2026-03-17T10:00:00Z"),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.data.status).toBe("critical");
    expect(body.data.alertCodes).toContain("DEAD_EVENTS_EXIST");
    expect(body.data.lastHealthCheckAt).toBeTruthy();
  });

  it("FAILED_EVENTS_HIGH のみ → status=warning", async () => {
    mockGetLatest.mockResolvedValue({
      id: 2,
      alertCodesJson: JSON.stringify(["FAILED_EVENTS_HIGH"]),
      suppressedByCooldown: true,
      createdAt: new Date("2026-03-17T11:00:00Z"),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.data.status).toBe("warning");
    expect(body.data.suppressedByCooldown).toBe(true);
  });

  it("空の alertCodes → status=healthy", async () => {
    mockGetLatest.mockResolvedValue({
      id: 3,
      alertCodesJson: "[]",
      suppressedByCooldown: false,
      createdAt: new Date("2026-03-17T12:00:00Z"),
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.data.status).toBe("healthy");
  });
});
