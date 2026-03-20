import { describe, it, expect } from "vitest";
import {
  validateWorkerPayloadEnvelope,
  assertWorkerTenantOwnership,
  assertExecutionContextConsistency,
} from "@/worker/validators";
import type { OutboxEventPayloadEnvelope } from "@/outbox/types";

function makeEnvelope(
  overrides: Partial<OutboxEventPayloadEnvelope> = {},
): OutboxEventPayloadEnvelope {
  return {
    requestId: "req-001",
    executionContext: "tenant",
    tenantId: 1,
    actorUserId: 10,
    jobType: "invoice.created",
    resourceId: 42,
    payload: { invoiceId: 42 },
    ...overrides,
  } as OutboxEventPayloadEnvelope;
}

// --- validateWorkerPayloadEnvelope ---

describe("validateWorkerPayloadEnvelope", () => {
  it("正常な envelope はエラーなし", () => {
    expect(() => validateWorkerPayloadEnvelope(makeEnvelope())).not.toThrow();
  });

  it("requestId 欠落でエラー", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(makeEnvelope({ requestId: "" as any })),
    ).toThrow("requestId");
  });

  it("不正な executionContext でエラー", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(
        makeEnvelope({ executionContext: "invalid" as any }),
      ),
    ).toThrow("executionContext");
  });

  it("tenant context で tenantId null はエラー", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(
        makeEnvelope({ executionContext: "tenant", tenantId: null }),
      ),
    ).toThrow("tenantId");
  });

  it("platform context で tenantId null は正常", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(
        makeEnvelope({ executionContext: "platform", tenantId: null }),
      ),
    ).not.toThrow();
  });

  it("system context は正常", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(
        makeEnvelope({ executionContext: "system", tenantId: null }),
      ),
    ).not.toThrow();
  });

  it("jobType 欠落でエラー", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(makeEnvelope({ jobType: "" as any })),
    ).toThrow("jobType");
  });

  it("payload が null でエラー", () => {
    expect(() =>
      validateWorkerPayloadEnvelope(makeEnvelope({ payload: null as any })),
    ).toThrow("payload");
  });
});

// --- assertWorkerTenantOwnership ---

describe("assertWorkerTenantOwnership", () => {
  it("tenantId 一致は正常", () => {
    expect(() =>
      assertWorkerTenantOwnership({
        payloadTenantId: 1,
        dbTenantId: 1,
        eventType: "invoice.created",
        resourceId: 42,
      }),
    ).not.toThrow();
  });

  it("tenantId 不一致でエラー", () => {
    expect(() =>
      assertWorkerTenantOwnership({
        payloadTenantId: 1,
        dbTenantId: 2,
        eventType: "invoice.created",
        resourceId: 42,
      }),
    ).toThrow("Tenant ownership mismatch");
  });

  it("payloadTenantId null はスキップ（system/platform）", () => {
    expect(() =>
      assertWorkerTenantOwnership({
        payloadTenantId: null,
        dbTenantId: 1,
        eventType: "tenant.suspended",
        resourceId: 1,
      }),
    ).not.toThrow();
  });

  it("エラーに詳細情報を含む", () => {
    try {
      assertWorkerTenantOwnership({
        payloadTenantId: 1,
        dbTenantId: 2,
        eventType: "invoice.created",
        resourceId: 42,
      });
      expect.fail("should throw");
    } catch (e: any) {
      expect(e.payloadTenantId).toBe(1);
      expect(e.dbTenantId).toBe(2);
      expect(e.eventType).toBe("invoice.created");
      expect(e.resourceId).toBe(42);
    }
  });
});

// --- assertExecutionContextConsistency ---

describe("assertExecutionContextConsistency", () => {
  it("一致は正常", () => {
    expect(() =>
      assertExecutionContextConsistency("tenant", "tenant"),
    ).not.toThrow();
  });

  it("不一致でエラー", () => {
    expect(() =>
      assertExecutionContextConsistency("tenant", "platform"),
    ).toThrow("ExecutionContext mismatch");
  });
});
