import { describe, it, expect, vi } from "vitest";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";
import type { RequestContext, RequestId, TenantId, ActorUserId } from "@/shared/types";

// --- mock ---

let capturedCtx: RequestContext | null = null;

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((ctx: RequestContext, fn: () => unknown) => {
    capturedCtx = ctx;
    return fn();
  }),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((opts: Record<string, unknown>) => ({
    requestId: opts.requestId,
    executionContext: opts.executionContext,
    tenantId: opts.tenantId ?? null,
    actorUserId: opts.actorUserId ?? null,
    actorRole: opts.actorRole ?? null,
  })),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((ctx: RequestContext, fn: () => unknown) => {
    capturedCtx = ctx;
    return fn();
  }),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((opts: Record<string, unknown>) => ({
    requestId: opts.requestId,
    executionContext: opts.executionContext,
    tenantId: opts.tenantId ?? null,
    actorUserId: opts.actorUserId ?? null,
    actorRole: opts.actorRole ?? null,
  })),
}));

vi.mock("@/shared/logging", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const {
  buildWorkerRequestContext,
  runWorkerWithContext,
  resolveWorkerExecutionPlan,
} = await import("@/worker/context");

function makeEnvelope(
  overrides: Partial<OutboxEventPayloadEnvelope> = {},
): OutboxEventPayloadEnvelope {
  return {
    requestId: "req-w-001" as RequestId,
    executionContext: "tenant",
    tenantId: 1 as unknown as TenantId,
    actorUserId: 10 as unknown as ActorUserId,
    jobType: "invoice.created",
    resourceId: 42,
    payload: { invoiceId: 42 },
    ...overrides,
  } as OutboxEventPayloadEnvelope;
}

// --- buildWorkerRequestContext ---

describe("buildWorkerRequestContext", () => {
  it("envelope から RequestContext を組み立てる", () => {
    const ctx = buildWorkerRequestContext(makeEnvelope());
    expect(ctx.requestId).toBe("req-w-001");
    expect(ctx.executionContext).toBe("tenant");
    expect(ctx.tenantId).toBe(1);
    expect(ctx.actorUserId).toBe(10);
    expect(ctx.actorRole).toBeNull(); // worker では null
  });

  it("platform context では tenantId null", () => {
    const ctx = buildWorkerRequestContext(
      makeEnvelope({ executionContext: "platform", tenantId: null }),
    );
    expect(ctx.executionContext).toBe("platform");
    expect(ctx.tenantId).toBeNull();
  });
});

// --- runWorkerWithContext ---

describe("runWorkerWithContext", () => {
  it("RequestContext を設定して fn を実行する", () => {
    const result = runWorkerWithContext(makeEnvelope(), () => "done");
    expect(result).toBe("done");
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.requestId).toBe("req-w-001");
  });
});

// --- resolveWorkerExecutionPlan ---

describe("resolveWorkerExecutionPlan", () => {
  it("tenant context → tenantId 付きプラン", () => {
    const plan = resolveWorkerExecutionPlan(makeEnvelope());
    expect(plan.executionContext).toBe("tenant");
    if (plan.executionContext === "tenant") {
      expect(plan.tenantId).toBe(1);
    }
  });

  it("platform context → targetTenantId 付きプラン", () => {
    const plan = resolveWorkerExecutionPlan(
      makeEnvelope({
        executionContext: "platform",
        tenantId: null,
        targetTenantId: 5 as unknown as TenantId,
      }),
    );
    expect(plan.executionContext).toBe("platform");
    if (plan.executionContext === "platform") {
      expect(plan.targetTenantId).toBe(5);
    }
  });

  it("system context → プレーンプラン", () => {
    const plan = resolveWorkerExecutionPlan(
      makeEnvelope({ executionContext: "system", tenantId: null }),
    );
    expect(plan.executionContext).toBe("system");
  });

  it("tenant context で tenantId null はエラー", () => {
    expect(() =>
      resolveWorkerExecutionPlan(
        makeEnvelope({ executionContext: "tenant", tenantId: null }),
      ),
    ).toThrow("tenantId");
  });

  it("不正な executionContext はエラー", () => {
    expect(() =>
      resolveWorkerExecutionPlan(
        makeEnvelope({ executionContext: "unknown" as any }),
      ),
    ).toThrow("Unknown executionContext");
  });
});
