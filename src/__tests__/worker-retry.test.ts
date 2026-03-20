import { describe, it, expect } from "vitest";
import type { ParsedWorkerJob, WorkerProcessResult } from "@/worker/types";
import {
  shouldRetryWorkerJob,
  shouldMoveWorkerJobToDead,
  isNonRetryableError,
  calculateNextRetryAt,
} from "@/worker/retry";
import {
  WorkerPayloadValidationError,
  WorkerTenantContextError,
  WorkerOwnershipMismatchError,
  WorkerHandlerNotFoundError,
  WorkerExecutionError,
} from "@/worker/errors";

function makeJob(overrides: Partial<ParsedWorkerJob> = {}): ParsedWorkerJob {
  return {
    source: "outbox",
    eventType: "invoice.created",
    executionMode: "queue",
    payloadEnvelope: {} as any,
    rawPayloadJson: "{}",
    recordId: 1,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

// --- shouldRetryWorkerJob ---

describe("shouldRetryWorkerJob", () => {
  it("sent はリトライしない", () => {
    expect(shouldRetryWorkerJob(makeJob(), { status: "sent" })).toBe(false);
  });

  it("dead はリトライしない", () => {
    expect(
      shouldRetryWorkerJob(makeJob(), {
        status: "dead",
        errorMessage: "fatal",
      }),
    ).toBe(false);
  });

  it("failed + retryable でリトライ上限未到達 → リトライ", () => {
    expect(
      shouldRetryWorkerJob(makeJob({ retryCount: 0, maxRetries: 3 }), {
        status: "failed",
        errorMessage: "timeout",
        retryable: true,
      }),
    ).toBe(true);
  });

  it("failed + retryable でリトライ上限到達 → リトライしない", () => {
    expect(
      shouldRetryWorkerJob(makeJob({ retryCount: 2, maxRetries: 3 }), {
        status: "failed",
        errorMessage: "timeout",
        retryable: true,
      }),
    ).toBe(false);
  });

  it("failed + not retryable → リトライしない", () => {
    expect(
      shouldRetryWorkerJob(makeJob(), {
        status: "failed",
        errorMessage: "validation",
        retryable: false,
      }),
    ).toBe(false);
  });
});

// --- shouldMoveWorkerJobToDead ---

describe("shouldMoveWorkerJobToDead", () => {
  it("dead result → dead", () => {
    expect(
      shouldMoveWorkerJobToDead(makeJob(), {
        status: "dead",
        errorMessage: "fatal",
      }),
    ).toBe(true);
  });

  it("failed + not retryable → dead", () => {
    expect(
      shouldMoveWorkerJobToDead(makeJob(), {
        status: "failed",
        errorMessage: "validation",
        retryable: false,
      }),
    ).toBe(true);
  });

  it("failed + retryable + 上限到達 → dead", () => {
    expect(
      shouldMoveWorkerJobToDead(makeJob({ retryCount: 2, maxRetries: 3 }), {
        status: "failed",
        errorMessage: "timeout",
        retryable: true,
      }),
    ).toBe(true);
  });

  it("failed + retryable + 上限未到達 → dead ではない", () => {
    expect(
      shouldMoveWorkerJobToDead(makeJob({ retryCount: 0, maxRetries: 3 }), {
        status: "failed",
        errorMessage: "timeout",
        retryable: true,
      }),
    ).toBe(false);
  });

  it("sent → dead ではない", () => {
    expect(shouldMoveWorkerJobToDead(makeJob(), { status: "sent" })).toBe(
      false,
    );
  });
});

// --- isNonRetryableError ---

describe("isNonRetryableError", () => {
  it("WorkerPayloadValidationError はリトライ不可", () => {
    expect(isNonRetryableError(new WorkerPayloadValidationError("bad"))).toBe(
      true,
    );
  });

  it("WorkerTenantContextError はリトライ不可", () => {
    expect(isNonRetryableError(new WorkerTenantContextError("bad"))).toBe(true);
  });

  it("WorkerOwnershipMismatchError はリトライ不可", () => {
    expect(
      isNonRetryableError(
        new WorkerOwnershipMismatchError(1, 2, "test", null),
      ),
    ).toBe(true);
  });

  it("WorkerHandlerNotFoundError はリトライ不可", () => {
    expect(isNonRetryableError(new WorkerHandlerNotFoundError("test"))).toBe(
      true,
    );
  });

  it("WorkerExecutionError はリトライ不可ではない", () => {
    expect(isNonRetryableError(new WorkerExecutionError("timeout"))).toBe(
      false,
    );
  });

  it("通常の Error はリトライ不可ではない", () => {
    expect(isNonRetryableError(new Error("generic"))).toBe(false);
  });
});

// --- calculateNextRetryAt ---

describe("calculateNextRetryAt", () => {
  const baseTime = new Date("2026-03-16T00:00:00Z");

  it("retryCount=0 → 30秒後", () => {
    const next = calculateNextRetryAt(0, baseTime);
    expect(next.getTime() - baseTime.getTime()).toBe(30 * 1000);
  });

  it("retryCount=1 → 60秒後", () => {
    const next = calculateNextRetryAt(1, baseTime);
    expect(next.getTime() - baseTime.getTime()).toBe(60 * 1000);
  });

  it("retryCount=2 → 120秒後", () => {
    const next = calculateNextRetryAt(2, baseTime);
    expect(next.getTime() - baseTime.getTime()).toBe(120 * 1000);
  });

  it("大きな retryCount は上限 3600秒", () => {
    const next = calculateNextRetryAt(20, baseTime);
    expect(next.getTime() - baseTime.getTime()).toBe(3600 * 1000);
  });
});
