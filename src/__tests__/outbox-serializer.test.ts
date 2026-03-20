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

const {
  sanitizeOutboxPayload,
  buildOutboxEnvelope,
  resolveOutboxEventInput,
} = await import("@/outbox/serializer");

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
  requestId: rid("req-out-1"),
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
// sanitizeOutboxPayload
// ============================================================
describe("sanitizeOutboxPayload", () => {
  it("通常のフィールドはそのまま", () => {
    const result = sanitizeOutboxPayload({ name: "test", count: 5 });
    expect(result.name).toBe("test");
    expect(result.count).toBe(5);
  });

  it("機密キーが [REDACTED] に置換される", () => {
    const result = sanitizeOutboxPayload({
      data: "ok",
      password: "secret",
      apiKey: "ak_xxx",
      accessToken: "eyJ...",
    });
    expect(result.data).toBe("ok");
    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.accessToken).toBe("[REDACTED]");
  });

  it("ネストされたオブジェクトの機密キーも置換される", () => {
    const result = sanitizeOutboxPayload({
      user: { name: "test", passwordHash: "xxx" },
    });
    const nested = result.user as Record<string, unknown>;
    expect(nested.name).toBe("test");
    expect(nested.passwordHash).toBe("[REDACTED]");
  });
});

// ============================================================
// buildOutboxEnvelope — RequestContext あり
// ============================================================
describe("buildOutboxEnvelope — RequestContext あり", () => {
  it("RequestContext から補完される", () => {
    mockCtx = testContext;

    const envelope = buildOutboxEnvelope(baseInput);

    expect(envelope.requestId).toBe("req-out-1");
    expect(envelope.executionContext).toBe("tenant");
    expect(envelope.tenantId).toBe(10);
    expect(envelope.actorUserId).toBe(42);
    expect(envelope.jobType).toBe("invoice.created");
    expect(envelope.resourceId).toBe(100);
  });

  it("payload が sanitize される", () => {
    mockCtx = testContext;

    const envelope = buildOutboxEnvelope({
      ...baseInput,
      payload: { invoiceId: 1, secretKey: "xxx" },
    });

    expect(envelope.payload.invoiceId).toBe(1);
    expect(envelope.payload.secretKey).toBe("[REDACTED]");
  });

  it("明示値は RequestContext より優先される", () => {
    mockCtx = testContext;

    const envelope = buildOutboxEnvelope({
      ...baseInput,
      requestId: rid("explicit"),
      tenantId: tid(99),
      actorUserId: uid(1),
      executionContext: "platform",
    });

    expect(envelope.requestId).toBe("explicit");
    expect(envelope.tenantId).toBe(99);
    expect(envelope.actorUserId).toBe(1);
    expect(envelope.executionContext).toBe("platform");
  });

  it("targetTenantId が設定できる", () => {
    mockCtx = testContext;

    const envelope = buildOutboxEnvelope({
      ...baseInput,
      targetTenantId: tid(5),
    });

    expect(envelope.targetTenantId).toBe(5);
  });
});

// ============================================================
// buildOutboxEnvelope — RequestContext なし
// ============================================================
describe("buildOutboxEnvelope — RequestContext なし", () => {
  it("requestId 未指定でエラー", () => {
    expect(() => buildOutboxEnvelope(baseInput)).toThrow("requestId is required");
  });

  it("executionContext 未指定でエラー", () => {
    expect(() =>
      buildOutboxEnvelope({
        ...baseInput,
        requestId: rid("req-1"),
      }),
    ).toThrow("executionContext is required");
  });

  it("全必須項目を明示すれば成功", () => {
    const envelope = buildOutboxEnvelope({
      ...baseInput,
      requestId: rid("req-explicit"),
      executionContext: "system",
    });

    expect(envelope.requestId).toBe("req-explicit");
    expect(envelope.executionContext).toBe("system");
    expect(envelope.tenantId).toBeNull();
    expect(envelope.actorUserId).toBeNull();
  });
});

// ============================================================
// resolveOutboxEventInput
// ============================================================
describe("resolveOutboxEventInput", () => {
  it("status が pending で初期化される", () => {
    mockCtx = testContext;

    const resolved = resolveOutboxEventInput(baseInput);

    expect(resolved.status).toBe("pending");
  });

  it("payloadJson に tenant 文脈が含まれる", () => {
    mockCtx = testContext;

    const resolved = resolveOutboxEventInput(baseInput);
    const parsed = JSON.parse(resolved.payloadJson);

    expect(parsed.tenantId).toBe(10);
    expect(parsed.actorUserId).toBe(42);
    expect(parsed.executionContext).toBe("tenant");
    expect(parsed.requestId).toBe("req-out-1");
    expect(parsed.jobType).toBe("invoice.created");
    expect(parsed.resourceId).toBe(100);
  });

  it("payloadJson に業務データが含まれる", () => {
    mockCtx = testContext;

    const resolved = resolveOutboxEventInput(baseInput);
    const parsed = JSON.parse(resolved.payloadJson);

    expect(parsed.payload.invoiceId).toBe(100);
    expect(parsed.payload.amount).toBe(50000);
  });

  it("eventType / executionMode が反映される", () => {
    mockCtx = testContext;

    const resolved = resolveOutboxEventInput(baseInput);

    expect(resolved.eventType).toBe("invoice.created");
    expect(resolved.executionMode).toBe("queue");
  });

  it("availableAt が設定される（デフォルトは現在時刻付近）", () => {
    mockCtx = testContext;

    const before = new Date();
    const resolved = resolveOutboxEventInput(baseInput);
    const after = new Date();

    expect(resolved.availableAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(resolved.availableAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("availableAt を明示指定できる", () => {
    mockCtx = testContext;
    const future = new Date("2026-12-31T00:00:00Z");

    const resolved = resolveOutboxEventInput({
      ...baseInput,
      availableAt: future,
    });

    expect(resolved.availableAt).toEqual(future);
  });
});
