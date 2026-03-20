/**
 * platform-alerts テスト
 *
 * notifyOutboxOperationalAlerts の仕様を検証:
 * - alerts なしで skipped
 * - 環境変数なしで skipped
 * - webhook のみ通知
 * - mail のみ通知
 * - 両方失敗でも throw しない
 * - reason が結果に格納される
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));
vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));

const mockWebhookDispatch = vi.fn();
const mockMailSend = vi.fn();

vi.mock("@/infrastructure/factory", () => ({
  createWebhookDispatcher: () => ({ dispatch: mockWebhookDispatch }),
  createMailer: () => ({ send: mockMailSend }),
}));

vi.mock("@/infrastructure/config", () => ({
  getSesFromAddress: () => "noreply@example.com",
  isRealEmailSendAllowed: () => true,
  isAllowedEmailRecipient: () => true,
  isRealWebhookSendAllowed: () => true,
  isAllowedWebhookEndpoint: () => true,
}));

vi.mock("@/features/platform-alert-history", () => ({
  buildAlertDedupKey: () => "DEAD_EVENTS_EXIST",
  shouldSendPlatformAlert: vi.fn().mockResolvedValue(true),
  markPlatformAlertSent: vi.fn().mockResolvedValue(undefined),
}));

import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";
import { notifyOutboxOperationalAlerts } from "@/features/platform-alerts/service";
import {
  buildOutboxAlertWebhookPayload,
  buildOutboxAlertMailSubject,
  buildOutboxAlertMailBody,
} from "@/features/platform-alerts/templates";

function makeSummary(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return {
    pendingCount: 0,
    processingCount: 0,
    failedCount: 0,
    deadCount: 0,
    sentCount: 100,
    retryableFailedCount: 0,
    stuckProcessingCount: 0,
    recoverableStuckCount: 0,
    oldestPendingCreatedAt: null,
    oldestFailedCreatedAt: null,
    recentErrorSamples: [],
    ...overrides,
  };
}

function makeAlerts(): OutboxOperationalAlert[] {
  return [{ level: "warning", code: "DEAD_EVENTS_EXIST", count: 2 }];
}

// ────────────────────────────────────────────────────────────
// skipped ケース
// ────────────────────────────────────────────────────────────

describe("notifyOutboxOperationalAlerts — skipped", () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; vi.clearAllMocks(); });

  it("alerts が 0 件 → skipped=true", async () => {
    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: [],
      triggeredAt: new Date(),
      environment: "staging",
    });
    expect(result.skipped).toBe(true);
    expect(result.notifiedByWebhook).toBe(false);
    expect(result.notifiedByMail).toBe(false);
  });

  it("環境変数未設定 → skipped=true", async () => {
    delete process.env.OUTBOX_ALERT_WEBHOOK_URL;
    delete process.env.OUTBOX_ALERT_EMAIL_TO;

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });
    expect(result.skipped).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining("not set")]));
  });
});

// ────────────────────────────────────────────────────────────
// webhook のみ通知
// ────────────────────────────────────────────────────────────

describe("notifyOutboxOperationalAlerts — webhook のみ", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/outbox-alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;
    vi.clearAllMocks();
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("webhook 成功 → notifiedByWebhook=true", async () => {
    mockWebhookDispatch.mockResolvedValue({ ok: true, providerMessageId: null });

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary({ deadCount: 2 }),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.notifiedByWebhook).toBe(true);
    expect(result.notifiedByMail).toBe(false);
    expect(result.skipped).toBe(false);
    expect(mockWebhookDispatch).toHaveBeenCalledOnce();
  });

  it("webhook 失敗 → notifiedByWebhook=false、reason に格納", async () => {
    mockWebhookDispatch.mockResolvedValue({
      ok: false,
      errorMessage: "connection refused",
      retryable: true,
    });

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.notifiedByWebhook).toBe(false);
    expect(result.reasons.some((r) => r.includes("webhook failed"))).toBe(true);
  });

  it("webhook が例外 throw → catch して reason に格納、throw しない", async () => {
    mockWebhookDispatch.mockRejectedValue(new Error("network error"));

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.notifiedByWebhook).toBe(false);
    expect(result.reasons.some((r) => r.includes("network error"))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// mail のみ通知
// ────────────────────────────────────────────────────────────

describe("notifyOutboxOperationalAlerts — mail のみ", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.OUTBOX_ALERT_WEBHOOK_URL;
    process.env.OUTBOX_ALERT_EMAIL_TO = "ops@example.com";
    vi.clearAllMocks();
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("mail 成功 → notifiedByMail=true", async () => {
    mockMailSend.mockResolvedValue({ ok: true, providerMessageId: "msg-1" });

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "production",
    });

    expect(result.notifiedByMail).toBe(true);
    expect(result.notifiedByWebhook).toBe(false);
    expect(mockMailSend).toHaveBeenCalledOnce();
  });

  it("mail の subject に環境名が入る", async () => {
    mockMailSend.mockResolvedValue({ ok: true, providerMessageId: null });

    await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    const callArg = mockMailSend.mock.calls[0][0];
    expect(callArg.subject).toContain("STAGING");
  });
});

// ────────────────────────────────────────────────────────────
// templates
// ────────────────────────────────────────────────────────────

describe("buildOutboxAlertWebhookPayload", () => {
  it("event フィールドと alerts を含む", () => {
    const payload = buildOutboxAlertWebhookPayload(makeSummary({ deadCount: 2 }), makeAlerts());
    expect(payload.event).toBe("outbox.operational_alert");
    expect(Array.isArray(payload.alerts)).toBe(true);
    const alerts = payload.alerts as Array<{ code: string; count: number }>;
    expect(alerts[0].code).toBe("DEAD_EVENTS_EXIST");
    expect(alerts[0].count).toBe(2);
  });
});

describe("buildOutboxAlertMailSubject", () => {
  it("環境名と alert code を含む", () => {
    const subject = buildOutboxAlertMailSubject("staging", makeAlerts());
    expect(subject).toContain("STAGING");
    expect(subject).toContain("DEAD_EVENTS_EXIST");
  });
});

describe("buildOutboxAlertMailBody", () => {
  it("summary カウントを含む", () => {
    const body = buildOutboxAlertMailBody(
      makeSummary({ deadCount: 3, failedCount: 5 }),
      makeAlerts(),
    );
    expect(body).toContain("dead: 3");
    expect(body).toContain("failed: 5");
  });
});
