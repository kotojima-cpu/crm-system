import { describe, it, expect } from "vitest";
import {
  maskOutboxPayloadForDisplay,
  extractEnvelopeFields,
  formatOutboxStatusLabel,
  isOutboxRetryAllowed,
  isOutboxReplayAllowed,
  isOutboxForceReplayAllowed,
  buildOutboxListItem,
  buildOutboxDetailView,
} from "@/features/platform-outbox/presenters";

// ────────────────────────────────────────────────────────────
// maskOutboxPayloadForDisplay
// ────────────────────────────────────────────────────────────

describe("maskOutboxPayloadForDisplay", () => {
  it("通常フィールドはそのまま返る", () => {
    const result = maskOutboxPayloadForDisplay(
      JSON.stringify({ invoiceId: 1, amount: 50000 }),
    );
    expect(result.invoiceId).toBe(1);
    expect(result.amount).toBe(50000);
  });

  it("機密キーは [REDACTED] に置換される", () => {
    const result = maskOutboxPayloadForDisplay(
      JSON.stringify({ invoiceId: 1, secretApiKey: "xxx", password: "pass" }),
    );
    expect(result.secretApiKey).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.invoiceId).toBe(1);
  });

  it("ネストしたオブジェクトの機密キーも REDACTED", () => {
    const result = maskOutboxPayloadForDisplay(
      JSON.stringify({ user: { token: "abc", name: "Alice" } }),
    );
    const user = result.user as Record<string, unknown>;
    expect(user.token).toBe("[REDACTED]");
    expect(user.name).toBe("Alice");
  });

  it("不正な JSON は _parseError を返す", () => {
    const result = maskOutboxPayloadForDisplay("{invalid");
    expect(result._parseError).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// extractEnvelopeFields
// ────────────────────────────────────────────────────────────

describe("extractEnvelopeFields", () => {
  it("envelope フィールドを正しく抽出する", () => {
    const payload = JSON.stringify({
      requestId: "req-001",
      tenantId: 5,
      resourceId: 100,
      jobType: "invoice.created",
    });
    const result = extractEnvelopeFields(payload);
    expect(result.requestId).toBe("req-001");
    expect(result.tenantId).toBe(5);
    expect(result.resourceId).toBe(100);
    expect(result.jobType).toBe("invoice.created");
  });

  it("フィールドがない場合は null を返す", () => {
    const result = extractEnvelopeFields(JSON.stringify({ foo: "bar" }));
    expect(result.requestId).toBeNull();
    expect(result.tenantId).toBeNull();
  });

  it("不正な JSON は空オブジェクトを返す", () => {
    const result = extractEnvelopeFields("{bad");
    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────
// formatOutboxStatusLabel
// ────────────────────────────────────────────────────────────

describe("formatOutboxStatusLabel", () => {
  it.each([
    ["pending", "待機中"],
    ["processing", "処理中"],
    ["sent", "送信済"],
    ["failed", "失敗"],
    ["dead", "停止（要対応）"],
  ] as const)("%s → %s", (status, expected) => {
    expect(formatOutboxStatusLabel(status)).toBe(expected);
  });

  it("未知ステータスはそのまま返す", () => {
    expect(formatOutboxStatusLabel("unknown")).toBe("unknown");
  });
});

// ────────────────────────────────────────────────────────────
// 操作可否判定
// ────────────────────────────────────────────────────────────

describe("isOutboxRetryAllowed", () => {
  it("failed のみ true", () => {
    expect(isOutboxRetryAllowed("failed")).toBe(true);
    expect(isOutboxRetryAllowed("dead")).toBe(false);
    expect(isOutboxRetryAllowed("pending")).toBe(false);
    expect(isOutboxRetryAllowed("sent")).toBe(false);
  });
});

describe("isOutboxReplayAllowed", () => {
  it("dead のみ true", () => {
    expect(isOutboxReplayAllowed("dead")).toBe(true);
    expect(isOutboxReplayAllowed("failed")).toBe(false);
    expect(isOutboxReplayAllowed("sent")).toBe(false);
  });
});

describe("isOutboxForceReplayAllowed", () => {
  it("sent のみ true", () => {
    expect(isOutboxForceReplayAllowed("sent")).toBe(true);
    expect(isOutboxForceReplayAllowed("dead")).toBe(false);
    expect(isOutboxForceReplayAllowed("failed")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// buildOutboxListItem / buildOutboxDetailView
// ────────────────────────────────────────────────────────────

function makeRawRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "failed",
    retryCount: 2,
    maxRetries: 3,
    lastError: "connection timeout",
    availableAt: new Date("2026-04-01T00:00:00Z"),
    processedAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T01:00:00Z"),
    payloadJson: JSON.stringify({
      requestId: "req-abc",
      tenantId: 10,
      resourceId: 42,
      jobType: "invoice.created",
      payload: { invoiceId: 42, secretApiKey: "secret" },
    }),
    ...overrides,
  };
}

describe("buildOutboxListItem", () => {
  it("envelope フィールドが抽出される", () => {
    const item = buildOutboxListItem(makeRawRecord());
    expect(item.requestId).toBe("req-abc");
    expect(item.tenantId).toBe(10);
    expect(item.resourceId).toBe(42);
    expect(item.jobType).toBe("invoice.created");
  });

  it("基本フィールドが正しくマッピングされる", () => {
    const item = buildOutboxListItem(makeRawRecord());
    expect(item.id).toBe(1);
    expect(item.status).toBe("failed");
    expect(item.retryCount).toBe(2);
  });
});

describe("buildOutboxDetailView", () => {
  it("maskedPayload に機密キーがない", () => {
    const detail = buildOutboxDetailView(makeRawRecord());
    const payload = detail.maskedPayload.payload as Record<string, unknown>;
    expect(payload.secretApiKey).toBe("[REDACTED]");
    expect(payload.invoiceId).toBe(42);
  });

  it("listItem フィールドも含まれる", () => {
    const detail = buildOutboxDetailView(makeRawRecord());
    expect(detail.requestId).toBe("req-abc");
    expect(detail.tenantId).toBe(10);
  });
});
