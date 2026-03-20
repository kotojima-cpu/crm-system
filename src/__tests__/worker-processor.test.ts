import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantId, RequestId, ActorUserId } from "@/shared/types";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";
import type { ParsedWorkerJob, WorkerProcessResult, WorkerHandlerMap } from "@/worker/types";

// --- mocks ---

vi.mock("@/shared/logging", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
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
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((opts: Record<string, unknown>) => ({
    requestId: opts.requestId,
    executionContext: opts.executionContext,
    tenantId: opts.tenantId ?? null,
    actorUserId: opts.actorUserId ?? null,
    actorRole: opts.actorRole ?? null,
  })),
}));

// Mock DB transaction wrappers
vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn((_tenantId: unknown, fn: (tx: unknown) => unknown) =>
    fn({ $executeRawUnsafe: vi.fn() }),
  ),
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ $executeRawUnsafe: vi.fn() }),
  ),
  withSystemTx: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ $executeRawUnsafe: vi.fn() }),
  ),
}));

const { processWorkerJob } = await import("@/worker/processor");
const { createWorkerHandlerMap, registerWorkerHandler } = await import(
  "@/worker/handlers"
);

function makeEnvelope(
  overrides: Partial<OutboxEventPayloadEnvelope> = {},
): OutboxEventPayloadEnvelope {
  return {
    requestId: "req-proc-001" as RequestId,
    executionContext: "tenant",
    tenantId: 1 as unknown as TenantId,
    actorUserId: 10 as unknown as ActorUserId,
    jobType: "invoice.created",
    resourceId: 42,
    payload: { invoiceId: 42 },
    ...overrides,
  } as OutboxEventPayloadEnvelope;
}

function makeJob(overrides: Partial<ParsedWorkerJob> = {}): ParsedWorkerJob {
  return {
    source: "outbox",
    eventType: "invoice.created",
    executionMode: "queue",
    payloadEnvelope: makeEnvelope(),
    rawPayloadJson: JSON.stringify(makeEnvelope()),
    recordId: 1,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

// --- processWorkerJob ---

describe("processWorkerJob", () => {
  let handlerMap: WorkerHandlerMap;

  beforeEach(() => {
    handlerMap = createWorkerHandlerMap();
  });

  it("handler 成功 → sent を返す", async () => {
    registerWorkerHandler(handlerMap, "invoice.created", async () => ({
      status: "sent" as const,
    }));

    const result = await processWorkerJob(makeJob(), handlerMap);
    expect(result.status).toBe("sent");
  });

  it("handler が failed を返す → failed を返す", async () => {
    registerWorkerHandler(handlerMap, "invoice.created", async () => ({
      status: "failed" as const,
      errorMessage: "external timeout",
      retryable: true,
    }));

    const result = await processWorkerJob(makeJob(), handlerMap);
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorMessage).toBe("external timeout");
      expect(result.retryable).toBe(true);
    }
  });

  it("handler が dead を返す → dead を返す", async () => {
    registerWorkerHandler(handlerMap, "invoice.created", async () => ({
      status: "dead" as const,
      errorMessage: "permanent failure",
    }));

    const result = await processWorkerJob(makeJob(), handlerMap);
    expect(result.status).toBe("dead");
  });

  it("未登録 eventType → dead（リトライ不可）", async () => {
    const job = makeJob({ eventType: "unknown.event" });
    const result = await processWorkerJob(job, handlerMap);
    expect(result.status).toBe("dead");
  });

  it("handler が throw → failed を返す", async () => {
    registerWorkerHandler(handlerMap, "invoice.created", async () => {
      throw new Error("unexpected error");
    });

    const result = await processWorkerJob(makeJob(), handlerMap);
    // 通常の Error はリトライ可能
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.retryable).toBe(true);
    }
  });

  it("platform context のジョブも処理できる", async () => {
    const platformEnvelope = makeEnvelope({
      executionContext: "platform",
      tenantId: null,
    });

    registerWorkerHandler(handlerMap, "tenant.suspended", async () => ({
      status: "sent" as const,
    }));

    const job = makeJob({
      eventType: "tenant.suspended",
      payloadEnvelope: platformEnvelope,
    });

    const result = await processWorkerJob(job, handlerMap);
    expect(result.status).toBe("sent");
  });

  it("system context のジョブも処理できる", async () => {
    const systemEnvelope = makeEnvelope({
      executionContext: "system",
      tenantId: null,
    });

    registerWorkerHandler(handlerMap, "batch.cleanup", async () => ({
      status: "sent" as const,
    }));

    const job = makeJob({
      eventType: "batch.cleanup",
      payloadEnvelope: systemEnvelope,
    });

    const result = await processWorkerJob(job, handlerMap);
    expect(result.status).toBe("sent");
  });

  it("tenant context で tenantId null → dead", async () => {
    const badEnvelope = makeEnvelope({
      executionContext: "tenant",
      tenantId: null,
    });

    registerWorkerHandler(handlerMap, "invoice.created", async () => ({
      status: "sent" as const,
    }));

    const job = makeJob({ payloadEnvelope: badEnvelope });
    const result = await processWorkerJob(job, handlerMap);
    expect(result.status).toBe("dead");
  });
});
