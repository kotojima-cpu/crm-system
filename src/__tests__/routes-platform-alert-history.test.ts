/**
 * GET /api/platform/outbox/alert-history テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({ getRequestContext: () => null }));
vi.mock("@/shared/context", () => ({ getRequestContext: () => null }));

const mockListAlertHistory = vi.fn();
vi.mock("@/features/platform-alert-history", () => ({
  listPlatformAlertHistory: (...args: unknown[]) => mockListAlertHistory(...args),
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

import { GET } from "@/app/api/platform/outbox/alert-history/route";

function makeRequest(url: string) {
  return { url } as unknown as import("next/server").NextRequest;
}

describe("GET /api/platform/outbox/alert-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAlertHistory.mockResolvedValue([]);
  });

  it("200 を返す", async () => {
    const res = await GET(makeRequest("http://localhost/api/platform/outbox/alert-history"));
    expect(res.status).toBe(200);
  });

  it("data.items が配列で返る", async () => {
    const res = await GET(makeRequest("http://localhost/api/platform/outbox/alert-history"));
    const body = await res.json();
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it("limit クエリが listPlatformAlertHistory に渡される", async () => {
    await GET(makeRequest("http://localhost/api/platform/outbox/alert-history?limit=5"));
    expect(mockListAlertHistory).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  it("channel=webhook が渡される", async () => {
    await GET(makeRequest("http://localhost/api/platform/outbox/alert-history?channel=webhook"));
    expect(mockListAlertHistory).toHaveBeenCalledWith(expect.objectContaining({ channel: "webhook" }));
  });

  it("channel=mail が渡される", async () => {
    await GET(makeRequest("http://localhost/api/platform/outbox/alert-history?channel=mail"));
    expect(mockListAlertHistory).toHaveBeenCalledWith(expect.objectContaining({ channel: "mail" }));
  });

  it("無効な channel は undefined になる", async () => {
    await GET(makeRequest("http://localhost/api/platform/outbox/alert-history?channel=fax"));
    expect(mockListAlertHistory).toHaveBeenCalledWith(expect.objectContaining({ channel: undefined }));
  });

  it("OUTBOX_READ 権限ガードが使われる", async () => {
    const { requirePlatformPermission } = await import("@/auth/guards");
    await GET(makeRequest("http://localhost/api/platform/outbox/alert-history"));
    expect(requirePlatformPermission).toHaveBeenCalledWith("OUTBOX_READ", expect.anything());
  });
});
