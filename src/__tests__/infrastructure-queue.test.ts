import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));

vi.mock("@/shared/logging", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { LocalQueue } = await import("@/infrastructure/queue/local-queue");
const { SqsQueue } = await import("@/infrastructure/queue/sqs-queue");

import type { QueuePublishInput } from "@/infrastructure/queue/types";

function makeInput(overrides: Partial<QueuePublishInput> = {}): QueuePublishInput {
  return {
    eventType: "invoice.created",
    executionMode: "queue",
    payloadJson: JSON.stringify({ invoiceId: 42 }),
    requestId: "req-queue-001",
    tenantId: 1,
    executionContext: "tenant",
    ...overrides,
  };
}

// --- LocalQueue ---

describe("LocalQueue", () => {
  it("payloadJson を受け取り dryRun 成功を返す", async () => {
    const queue = new LocalQueue();
    const result = await queue.publish(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.providerMessageId).toContain("local-queue-dry-run-");
    }
  });

  it("requestId / executionContext を保持する", async () => {
    const queue = new LocalQueue();
    const input = makeInput({ requestId: "req-custom", executionContext: "platform" });
    await queue.publish(input);
    expect(queue.messages).toHaveLength(1);
    expect(queue.messages[0].requestId).toBe("req-custom");
    expect(queue.messages[0].executionContext).toBe("platform");
  });

  it("FIFO 用キーを渡せる", async () => {
    const queue = new LocalQueue();
    const input = makeInput({
      deduplicationKey: "dedup-001",
      orderingKey: "tenant-1",
    });
    await queue.publish(input);
    expect(queue.messages[0].deduplicationKey).toBe("dedup-001");
    expect(queue.messages[0].orderingKey).toBe("tenant-1");
  });

  it("メモリにメッセージが蓄積される", async () => {
    const queue = new LocalQueue();
    await queue.publish(makeInput({ eventType: "a" }));
    await queue.publish(makeInput({ eventType: "b" }));
    expect(queue.messages).toHaveLength(2);
  });

  it("tenantId null でも動作する", async () => {
    const queue = new LocalQueue();
    const result = await queue.publish(makeInput({ tenantId: null }));
    expect(result.ok).toBe(true);
  });
});

// --- SqsQueue ---

describe("SqsQueue", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("AWS_SQS_QUEUE_URL 未設定 → non-retryable エラー", async () => {
    delete process.env.AWS_SQS_QUEUE_URL;
    const queue = new SqsQueue();
    const result = await queue.publish(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain("AWS_SQS_QUEUE_URL");
    }
  });

  it("AWS_SQS_QUEUE_URL 設定済み → stub 成功", async () => {
    process.env.AWS_SQS_QUEUE_URL = "https://sqs.ap-northeast-1.amazonaws.com/123/test-queue";
    const queue = new SqsQueue();
    const result = await queue.publish(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toContain("sqs-stub-");
    }
  });

  it("requestId / tenantId / executionContext が入力に含まれる", async () => {
    const input = makeInput({
      requestId: "req-ctx",
      tenantId: 99,
      executionContext: "system",
    });
    expect(input.requestId).toBe("req-ctx");
    expect(input.tenantId).toBe(99);
    expect(input.executionContext).toBe("system");
  });
});
