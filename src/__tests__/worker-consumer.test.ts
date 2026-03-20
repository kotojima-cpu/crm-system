/**
 * Worker Consumer テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((o: Record<string, unknown>) => o),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  requireRequestContext: vi.fn(),
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn((o: Record<string, unknown>) => o),
}));

const mockMarkProcessing = vi.fn();
const mockMarkSent = vi.fn();
const mockMarkFailed = vi.fn();
const mockMarkDead = vi.fn();
const mockLoadEventById = vi.fn();

vi.mock("@/outbox/dispatcher", () => ({
  markOutboxProcessing: mockMarkProcessing,
  markOutboxSent: mockMarkSent,
  markOutboxFailed: mockMarkFailed,
  markOutboxDead: mockMarkDead,
  loadOutboxEventById: mockLoadEventById,
}));

vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn((_: unknown, fn: (tx: unknown) => unknown) => fn({})),
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  withSystemTx: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
}));

vi.mock("@/worker/retry", () => ({
  calculateNextRetryAt: vi.fn(() => new Date()),
  shouldRetryWorkerJob: vi.fn(),
  shouldMoveWorkerJobToDead: vi.fn(),
  isNonRetryableError: vi.fn(() => false),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

const { consumeOutboxEventRecord, consumeOutboxEventById } = await import(
  "@/worker/consumer"
);
const { createWorkerHandlerMap, registerWorkerHandler } = await import(
  "@/worker/handlers"
);
const { shouldRetryWorkerJob, shouldMoveWorkerJobToDead } = await import(
  "@/worker/retry"
);

function makeRecord(overrides: Partial<{
  id: number;
  status: string;
  retryCount: number;
  maxRetries: number;
}> = {}) {
  const envelope = {
    requestId: "req-consumer-001",
    executionContext: "system",
    tenantId: null,
    actorUserId: null,
    jobType: "invoice.created",
    resourceId: 1,
    payload: { invoiceId: 1 },
  };
  return {
    id: 1,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "pending" as const,
    payloadJson: JSON.stringify(envelope),
    availableAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    lastError: null,
    processedAt: null,
    ...overrides,
  };
}

describe("consumeOutboxEventRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkProcessing.mockResolvedValue(undefined);
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockMarkDead.mockResolvedValue(undefined);
  });

  it("handler 成功で markOutboxSent が呼ばれる", async () => {
    const map = createWorkerHandlerMap();
    registerWorkerHandler(map, "invoice.created", async () => ({ status: "sent" as const }));
    (shouldMoveWorkerJobToDead as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (shouldRetryWorkerJob as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await consumeOutboxEventRecord(makeRecord() as never, map);

    expect(mockMarkProcessing).toHaveBeenCalledOnce();
    expect(mockMarkSent).toHaveBeenCalledOnce();
    expect(result.status).toBe("sent");
  });

  it("retryable failure で markOutboxFailed が呼ばれる", async () => {
    const map = createWorkerHandlerMap();
    registerWorkerHandler(map, "invoice.created", async () => ({
      status: "failed" as const, errorMessage: "timeout", retryable: true,
    }));
    (shouldMoveWorkerJobToDead as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (shouldRetryWorkerJob as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const result = await consumeOutboxEventRecord(makeRecord() as never, map);

    expect(mockMarkFailed).toHaveBeenCalledOnce();
    expect(result.status).toBe("failed");
  });

  it("non-retryable failure で markOutboxDead が呼ばれる", async () => {
    const map = createWorkerHandlerMap();
    registerWorkerHandler(map, "invoice.created", async () => ({
      status: "failed" as const, errorMessage: "invalid", retryable: false,
    }));
    (shouldMoveWorkerJobToDead as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (shouldRetryWorkerJob as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await consumeOutboxEventRecord(makeRecord() as never, map);

    expect(mockMarkDead).toHaveBeenCalledOnce();
    expect(result.status).toBe("failed");
  });

  it("handler dead で markOutboxDead が呼ばれる", async () => {
    const map = createWorkerHandlerMap();
    registerWorkerHandler(map, "invoice.created", async () => ({
      status: "dead" as const, errorMessage: "permanent",
    }));
    (shouldMoveWorkerJobToDead as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await consumeOutboxEventRecord(makeRecord() as never, map);
    expect(mockMarkDead).toHaveBeenCalledOnce();
  });

  it("parse error でも markOutboxDead が呼ばれる", async () => {
    const map = createWorkerHandlerMap();
    // invalid payloadJson
    const badRecord = { ...makeRecord(), payloadJson: "not-json" };

    const result = await consumeOutboxEventRecord(badRecord as never, map);

    expect(mockMarkProcessing).toHaveBeenCalledOnce();
    expect(mockMarkDead).toHaveBeenCalledOnce();
    expect(result.status).toBe("dead");
  });
});

describe("consumeOutboxEventById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkProcessing.mockResolvedValue(undefined);
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockMarkDead.mockResolvedValue(undefined);
  });

  it("存在する ID で処理を実行する", async () => {
    const envelope = {
      requestId: "req-001", executionContext: "system",
      tenantId: null, actorUserId: null,
      jobType: "invoice.created", resourceId: 1, payload: {},
    };
    mockLoadEventById.mockResolvedValue({
      id: 5, eventType: "invoice.created", executionMode: "queue",
      status: "pending", payloadJson: JSON.stringify(envelope),
      availableAt: new Date(), retryCount: 0, maxRetries: 3,
      lastError: null, processedAt: null,
    });

    const map = createWorkerHandlerMap();
    registerWorkerHandler(map, "invoice.created", async () => ({ status: "sent" as const }));
    (shouldMoveWorkerJobToDead as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const result = await consumeOutboxEventById(5, map);
    expect(result.status).toBe("sent");
  });

  it("存在しない ID で dead を返す", async () => {
    mockLoadEventById.mockResolvedValue(null);
    const map = createWorkerHandlerMap();
    const result = await consumeOutboxEventById(999, map);
    expect(result.status).toBe("dead");
  });
});
