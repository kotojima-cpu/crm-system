/**
 * POST /api/platform/outbox/history-cleanup テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/context", () => ({ getRequestContext: () => null }));

const mockCleanup = vi.fn();
vi.mock("@/features/platform-history-maintenance", () => ({
  cleanupPlatformHistory: (...args: unknown[]) => mockCleanup(...args),
}));

vi.mock("@/auth/guards", () => ({
  requirePlatformPermission: vi.fn().mockResolvedValue({
    runInContext: (fn: () => unknown) => fn(),
  }),
}));
vi.mock("@/auth/permissions", () => ({
  Permission: {
    OUTBOX_HEALTH_CHECK: "OUTBOX_HEALTH_CHECK",
  },
}));

// Use real ValidationError so instanceof works in the route handler
vi.mock("@/shared/errors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/errors")>();
  return actual;
});

import { POST } from "@/app/api/platform/outbox/history-cleanup/route";
import { ValidationError } from "@/shared/errors";

function makeRequest(body: unknown) {
  return {
    url: "http://localhost/api/platform/outbox/history-cleanup",
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

function makeRequestJsonFail() {
  return {
    url: "http://localhost/api/platform/outbox/history-cleanup",
    json: () => Promise.reject(new Error("bad json")),
  } as unknown as import("next/server").NextRequest;
}

const mockResult = {
  alertHistoryDeletedCount: 5,
  healthHistoryDeletedCount: 3,
  retentionDays: 30,
};

describe("POST /api/platform/outbox/history-cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanup.mockResolvedValue(mockResult);
  });

  it("200 with result", async () => {
    const res = await POST(makeRequest({ retentionDays: 30 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockResult);
  });

  it("ValidationError → 400", async () => {
    mockCleanup.mockRejectedValue(new ValidationError("retentionDays must be between 1 and 365"));
    const res = await POST(makeRequest({ retentionDays: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("OUTBOX_HEALTH_CHECK permission used", async () => {
    const { requirePlatformPermission } = await import("@/auth/guards");
    await POST(makeRequest({ retentionDays: 30 }));
    expect(requirePlatformPermission).toHaveBeenCalledWith("OUTBOX_HEALTH_CHECK", expect.anything());
  });

  it("default retentionDays when body is empty", async () => {
    await POST(makeRequestJsonFail());
    expect(mockCleanup).toHaveBeenCalledWith(undefined);
  });
});
