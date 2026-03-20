import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext, RequestId, TenantId, ActorUserId } from "@/shared/types";
import type { WriteOutboxEventInput } from "@/outbox/types";

let mockCtx: RequestContext | null = null;

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => mockCtx,
  requireRequestContext: () => {
    if (!mockCtx) throw new Error("RequestContext is not set");
    return mockCtx;
  },
  runWithRequestContext: vi.fn(),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => mockCtx,
  requireRequestContext: () => {
    if (!mockCtx) throw new Error("RequestContext is not set");
    return mockCtx;
  },
  runWithRequestContext: vi.fn(),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/logging", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { writeOutboxEvent, buildOutboxEventInput } = await import("@/outbox/writer");

function rid(s: string): RequestId {
  return s as RequestId;
}
function tid(n: number): TenantId {
  return n as TenantId;
}
function uid(n: number): ActorUserId {
  return n as ActorUserId;
}

const testContext: RequestContext = {
  requestId: rid("req-w-1"),
  executionContext: "tenant",
  tenantId: tid(10),
  actorUserId: uid(42),
  actorRole: "sales",
};

const baseInput: WriteOutboxEventInput = {
  eventType: "invoice.created",
  executionMode: "queue",
  jobType: "invoice.created",
  resourceId: 100,
  payload: { invoiceId: 100, amount: 50000 },
};

beforeEach(() => {
  mockCtx = null;
});

// ============================================================
// buildOutboxEventInput
// ============================================================
describe("buildOutboxEventInput", () => {
  it("status が pending で初期化される", () => {
    mockCtx = testContext;
    const resolved = buildOutboxEventInput(baseInput);
    expect(resolved.status).toBe("pending");
  });

  it("payloadJson に tenant 文脈が含まれる", () => {
    mockCtx = testContext;
    const resolved = buildOutboxEventInput(baseInput);
    const parsed = JSON.parse(resolved.payloadJson);

    expect(parsed.tenantId).toBe(10);
    expect(parsed.actorUserId).toBe(42);
    expect(parsed.executionContext).toBe("tenant");
    expect(parsed.requestId).toBe("req-w-1");
  });

  it("requestId が envelope に含まれる", () => {
    mockCtx = testContext;
    const resolved = buildOutboxEventInput(baseInput);

    expect(resolved.payloadEnvelope.requestId).toBe("req-w-1");
  });
});

// ============================================================
// writeOutboxEvent（本実装 — DB 永続化）
// ============================================================
describe("writeOutboxEvent — DB 永続化", () => {
  it("resolved を返す", async () => {
    mockCtx = testContext;

    const mockTx = {
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    const result = await writeOutboxEvent(mockTx, baseInput);

    expect(result.status).toBe("pending");
    expect(result.eventType).toBe("invoice.created");
    expect(result.executionMode).toBe("queue");
  });

  it("payloadEnvelope に tenant 文脈が含まれる", async () => {
    mockCtx = testContext;
    const mockTx = {
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    const result = await writeOutboxEvent(mockTx, baseInput);

    expect(result.payloadEnvelope.tenantId).toBe(10);
    expect(result.payloadEnvelope.actorUserId).toBe(42);
    expect(result.payloadEnvelope.executionContext).toBe("tenant");
    expect(result.payloadEnvelope.requestId).toBe("req-w-1");
    expect(result.payloadEnvelope.jobType).toBe("invoice.created");
    expect(result.payloadEnvelope.resourceId).toBe(100);
  });

  it("platform コンテキストで targetTenantId が反映される", async () => {
    mockCtx = {
      requestId: rid("req-plat"),
      executionContext: "platform",
      tenantId: null,
      actorUserId: uid(1),
      actorRole: "platform_admin",
    };
    const mockTx = {
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    const result = await writeOutboxEvent(mockTx, {
      ...baseInput,
      eventType: "tenant.suspended",
      executionMode: "webhook",
      targetTenantId: tid(5),
    });

    expect(result.payloadEnvelope.targetTenantId).toBe(5);
    expect(result.payloadEnvelope.executionContext).toBe("platform");
  });

  it("RequestContext なしで必須不足ならエラー", async () => {
    const mockTx = {
      outboxEvent: { create: vi.fn() },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    await expect(writeOutboxEvent(mockTx, baseInput)).rejects.toThrow(
      "requestId is required",
    );
  });

  it("payload の機密キーがサニタイズされる", async () => {
    mockCtx = testContext;
    const mockTx = {
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    const result = await writeOutboxEvent(mockTx, {
      ...baseInput,
      payload: { invoiceId: 1, secretApiKey: "xxx" },
    });

    expect(result.payloadEnvelope.payload.invoiceId).toBe(1);
    expect(result.payloadEnvelope.payload.secretApiKey).toBe("[REDACTED]");
  });

  it("tx.outboxEvent.create が呼ばれる（DB 永続化）", async () => {
    mockCtx = testContext;
    const createMock = vi.fn().mockResolvedValue({ id: 99 });
    const mockTx = {
      outboxEvent: { create: createMock },
    } as unknown as Parameters<typeof writeOutboxEvent>[0];

    await writeOutboxEvent(mockTx, baseInput);

    expect(createMock).toHaveBeenCalledOnce();
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.retryCount).toBe(0);
    expect(data.maxRetries).toBe(3);
    expect(data.lastError).toBeNull();
    expect(data.processedAt).toBeNull();
  });
});
