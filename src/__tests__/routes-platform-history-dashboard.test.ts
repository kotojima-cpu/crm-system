/**
 * GET /api/platform/outbox/history-dashboard テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/context", () => ({ getRequestContext: () => null }));

const mockGetDashboard = vi.fn();
vi.mock("@/features/platform-history-dashboard", () => ({
  getPlatformHistoryDashboardSummary: (...args: unknown[]) => mockGetDashboard(...args),
}));

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn().mockResolvedValue({
    runInContext: (fn: () => unknown) => fn(),
  }),
}));
vi.mock("@/auth/permissions", () => ({ Permission: { OUTBOX_READ: "OUTBOX_READ" } }));
vi.mock("@/shared/errors", () => ({
  toErrorResponse: (e: unknown) => ({ error: e }),
  ValidationError: class ValidationError extends Error {
    statusCode = 400;
    constructor(msg: string) { super(msg); }
  },
}));

import { GET } from "@/app/api/platform/outbox/history-dashboard/route";

function makeRequest(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

const mockSummary = {
  alertHistoryCount: 10,
  healthHistoryCount: 5,
  webhookAlertCount: 7,
  mailAlertCount: 3,
  suppressedHealthCheckCount: 2,
  latestHealthStatus: "healthy" as const,
  latestHealthCheckAt: null,
};

describe("GET /api/platform/outbox/history-dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDashboard.mockResolvedValue(mockSummary);
  });

  it("200 with data", async () => {
    const res = await GET(makeRequest("http://localhost/api/platform/outbox/history-dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockSummary);
  });

  it("OUTBOX_READ permission used", async () => {
    const { requirePlatformPermission } = await import("@/auth/guards");
    await GET(makeRequest("http://localhost/api/platform/outbox/history-dashboard"));
    expect(requirePlatformPermission).toHaveBeenCalledWith("OUTBOX_READ", expect.anything());
  });
});
