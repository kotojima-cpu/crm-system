/**
 * Phase 14 Route Smoke テスト
 *
 * UI / component / feature / route の import 整合確認。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/db", () => ({
  prisma: {
    outboxEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  withPlatformTx: vi.fn(),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({ normalizePhone: vi.fn(() => null) }));

vi.mock("@/outbox/replay", () => ({
  retryOutboxEventById: vi.fn(),
  replayDeadOutboxEventById: vi.fn(),
  forceReplaySentOutboxEvent: vi.fn(),
}));

vi.mock("@/outbox/poller", () => ({
  runOutboxPollCycle: vi.fn(),
}));

vi.mock("@/worker/handlers/index", () => ({
  createRegisteredHandlerMap: vi.fn(() => new Map()),
}));

// ────────────────────────────────────────────────────────────
// platform-outbox feature exports
// ────────────────────────────────────────────────────────────

describe("platform-outbox feature exports", () => {
  it("listOutboxEvents がエクスポートされている", async () => {
    const { listOutboxEvents } = await import("@/features/platform-outbox");
    expect(listOutboxEvents).toBeTypeOf("function");
  });

  it("getOutboxEventDetail がエクスポートされている", async () => {
    const { getOutboxEventDetail } = await import("@/features/platform-outbox");
    expect(getOutboxEventDetail).toBeTypeOf("function");
  });

  it("getOutboxSummary がエクスポートされている", async () => {
    const { getOutboxSummary } = await import("@/features/platform-outbox");
    expect(getOutboxSummary).toBeTypeOf("function");
  });

  it("getOutboxOperationalAlerts がエクスポートされている", async () => {
    const { getOutboxOperationalAlerts } = await import("@/features/platform-outbox");
    expect(getOutboxOperationalAlerts).toBeTypeOf("function");
  });

  it("replayDeadEvent がエクスポートされている", async () => {
    const { replayDeadEvent } = await import("@/features/platform-outbox");
    expect(replayDeadEvent).toBeTypeOf("function");
  });

  it("forceReplaySentEvent がエクスポートされている", async () => {
    const { forceReplaySentEvent } = await import("@/features/platform-outbox");
    expect(forceReplaySentEvent).toBeTypeOf("function");
  });
});

// ────────────────────────────────────────────────────────────
// presenters exports
// ────────────────────────────────────────────────────────────

describe("platform-outbox presenters exports", () => {
  it("maskOutboxPayloadForDisplay がエクスポートされている", async () => {
    const { maskOutboxPayloadForDisplay } = await import("@/features/platform-outbox/presenters");
    expect(maskOutboxPayloadForDisplay).toBeTypeOf("function");
  });

  it("formatOutboxStatusLabel がエクスポートされている", async () => {
    const { formatOutboxStatusLabel } = await import("@/features/platform-outbox/presenters");
    expect(formatOutboxStatusLabel).toBeTypeOf("function");
  });

  it("isOutboxRetryAllowed がエクスポートされている", async () => {
    const { isOutboxRetryAllowed } = await import("@/features/platform-outbox/presenters");
    expect(isOutboxRetryAllowed).toBeTypeOf("function");
  });
});

// ────────────────────────────────────────────────────────────
// API route smoke
// ────────────────────────────────────────────────────────────

describe("API route smoke — platform/outbox", () => {
  it("GET /api/platform/outbox route が GET をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/route");
    expect(route.GET).toBeTypeOf("function");
  });

  it("GET /api/platform/outbox/summary route が GET をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/summary/route");
    expect(route.GET).toBeTypeOf("function");
  });

  it("GET /api/platform/outbox/[eventId] route が GET をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/[eventId]/route");
    expect(route.GET).toBeTypeOf("function");
  });

  it("POST /api/platform/outbox/[eventId]/replay route が POST をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/[eventId]/replay/route");
    expect(route.POST).toBeTypeOf("function");
  });

  it("POST /api/platform/outbox/[eventId]/force-replay route が POST をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/[eventId]/force-replay/route");
    expect(route.POST).toBeTypeOf("function");
  });

  it("POST /api/platform/outbox/[eventId]/retry route が POST をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/[eventId]/retry/route");
    expect(route.POST).toBeTypeOf("function");
  });

  it("POST /api/platform/outbox/poll route が POST をエクスポートしている", async () => {
    const route = await import("@/app/api/platform/outbox/poll/route");
    expect(route.POST).toBeTypeOf("function");
  });
});

// ────────────────────────────────────────────────────────────
// audit actions smoke
// ────────────────────────────────────────────────────────────

describe("audit actions — outbox 系", () => {
  it("AUDIT_OUTBOX_RETRIED がエクスポートされている", async () => {
    const { AUDIT_OUTBOX_RETRIED } = await import("@/audit/actions");
    expect(AUDIT_OUTBOX_RETRIED.action).toBe("retry");
    expect(AUDIT_OUTBOX_RETRIED.resourceType).toBe("outbox_event");
  });

  it("AUDIT_OUTBOX_REPLAYED がエクスポートされている", async () => {
    const { AUDIT_OUTBOX_REPLAYED } = await import("@/audit/actions");
    expect(AUDIT_OUTBOX_REPLAYED.action).toBe("replay");
  });

  it("AUDIT_OUTBOX_FORCE_REPLAYED がエクスポートされている", async () => {
    const { AUDIT_OUTBOX_FORCE_REPLAYED } = await import("@/audit/actions");
    expect(AUDIT_OUTBOX_FORCE_REPLAYED).toBeDefined();
  });

  it("AUDIT_OUTBOX_POLL_TRIGGERED がエクスポートされている", async () => {
    const { AUDIT_OUTBOX_POLL_TRIGGERED } = await import("@/audit/actions");
    expect(AUDIT_OUTBOX_POLL_TRIGGERED.action).toBe("poll");
  });
});
