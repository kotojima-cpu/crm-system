import { describe, it, expect } from "vitest";
import type { OutboxEventRecord } from "@/outbox/dispatcher";
import {
  parsePayloadEnvelope,
  parseOutboxRecord,
  parseQueueMessage,
  parseWorkerJob,
} from "@/worker/parser";

const validEnvelopeObj = {
  requestId: "req-001",
  executionContext: "tenant",
  tenantId: 1,
  actorUserId: 10,
  jobType: "invoice.created",
  resourceId: 42,
  payload: { invoiceId: 42, amount: 10000 },
};

const validJson = JSON.stringify(validEnvelopeObj);

// --- parsePayloadEnvelope ---

describe("parsePayloadEnvelope", () => {
  it("正常な JSON を parse できる", () => {
    const envelope = parsePayloadEnvelope(validJson);
    expect(envelope.requestId).toBe("req-001");
    expect(envelope.executionContext).toBe("tenant");
    expect(envelope.jobType).toBe("invoice.created");
    expect(envelope.payload).toEqual({ invoiceId: 42, amount: 10000 });
  });

  it("不正な JSON でエラー", () => {
    expect(() => parsePayloadEnvelope("{invalid")).toThrow(
      "Invalid JSON payload",
    );
  });

  it("object 以外でエラー", () => {
    expect(() => parsePayloadEnvelope('"string"')).toThrow(
      "Payload must be a JSON object",
    );
  });

  it("requestId 欠落でエラー", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, requestId: undefined });
    expect(() => parsePayloadEnvelope(json)).toThrow("requestId");
  });

  it("executionContext 欠落でエラー", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, executionContext: undefined });
    expect(() => parsePayloadEnvelope(json)).toThrow("executionContext");
  });

  it("不正な executionContext でエラー", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, executionContext: "invalid" });
    expect(() => parsePayloadEnvelope(json)).toThrow("Invalid executionContext");
  });

  it("jobType 欠落でエラー", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, jobType: undefined });
    expect(() => parsePayloadEnvelope(json)).toThrow("jobType");
  });

  it("payload 欠落でエラー", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, payload: undefined });
    expect(() => parsePayloadEnvelope(json)).toThrow("payload");
  });

  it("resourceId フィールド欠落でエラー", () => {
    const { resourceId: _, ...rest } = validEnvelopeObj;
    const json = JSON.stringify(rest);
    expect(() => parsePayloadEnvelope(json)).toThrow("resourceId");
  });

  it("resourceId が null は許容", () => {
    const json = JSON.stringify({ ...validEnvelopeObj, resourceId: null });
    const envelope = parsePayloadEnvelope(json);
    expect(envelope.resourceId).toBeNull();
  });
});

// --- parseOutboxRecord ---

describe("parseOutboxRecord", () => {
  it("outbox レコードから ParsedWorkerJob を生成", () => {
    const record: OutboxEventRecord = {
      id: 1,
      eventType: "invoice.created",
      executionMode: "queue",
      status: "pending",
      payloadJson: validJson,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
    };

    const job = parseOutboxRecord(record);
    expect(job.source).toBe("outbox");
    expect(job.eventType).toBe("invoice.created");
    expect(job.executionMode).toBe("queue");
    expect(job.recordId).toBe(1);
    expect(job.retryCount).toBe(0);
    expect(job.maxRetries).toBe(3);
    expect(job.payloadEnvelope.requestId).toBe("req-001");
  });
});

// --- parseQueueMessage ---

describe("parseQueueMessage", () => {
  it("queue メッセージから ParsedWorkerJob を生成", () => {
    const job = parseQueueMessage(validJson);
    expect(job.source).toBe("queue");
    expect(job.eventType).toBe("invoice.created"); // jobType から取得
    expect(job.executionMode).toBe("queue");
    expect(job.recordId).toBeNull();
    expect(job.retryCount).toBe(0);
    expect(job.maxRetries).toBe(3);
  });

  it("options で上書きできる", () => {
    const job = parseQueueMessage(validJson, {
      source: "eventbus",
      eventType: "custom.event",
      executionMode: "email",
      retryCount: 2,
      maxRetries: 5,
    });
    expect(job.source).toBe("eventbus");
    expect(job.eventType).toBe("custom.event");
    expect(job.executionMode).toBe("email");
    expect(job.retryCount).toBe(2);
    expect(job.maxRetries).toBe(5);
  });
});

// --- parseWorkerJob ---

describe("parseWorkerJob", () => {
  it("OutboxEventRecord を自動判別", () => {
    const record: OutboxEventRecord = {
      id: 1,
      eventType: "invoice.created",
      executionMode: "queue",
      status: "pending",
      payloadJson: validJson,
      retryCount: 0,
      maxRetries: 3,
      lastError: null,
    };

    const job = parseWorkerJob(record);
    expect(job.source).toBe("outbox");
  });

  it("JSON string を自動判別", () => {
    const job = parseWorkerJob(validJson);
    expect(job.source).toBe("queue");
  });

  it("object を自動判別", () => {
    const job = parseWorkerJob(validEnvelopeObj as Record<string, unknown>);
    expect(job.source).toBe("queue");
    expect(job.payloadEnvelope.jobType).toBe("invoice.created");
  });
});
