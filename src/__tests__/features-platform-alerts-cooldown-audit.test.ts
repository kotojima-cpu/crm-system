/**
 * platform-alerts cooldown + audit 統合テスト（Phase 18）
 *
 * cooldown suppress 時に:
 * - reasons に suppression メッセージが入る
 * - auditOutboxAlertSuppressed が呼ばれる
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
vi.mock("@/infrastructure/config", () => ({
  getSesFromAddress: () => "noreply@example.com",
}));

const mockWebhookDispatch = vi.fn();
const mockMailSend = vi.fn();
vi.mock("@/infrastructure/factory", () => ({
  createWebhookDispatcher: () => ({ dispatch: mockWebhookDispatch }),
  createMailer: () => ({ send: mockMailSend }),
}));

const mockShouldSend = vi.fn();
const mockMarkSent = vi.fn();
vi.mock("@/features/platform-alert-history", () => ({
  buildAlertDedupKey: () => "DEAD_EVENTS_EXIST",
  shouldSendPlatformAlert: (...args: unknown[]) => mockShouldSend(...args),
  markPlatformAlertSent: (...args: unknown[]) => mockMarkSent(...args),
}));

const mockAuditSuppressed = vi.fn();
vi.mock("@/features/platform-alerts/audit", () => ({
  auditOutboxAlertSuppressed: (...args: unknown[]) => mockAuditSuppressed(...args),
}));

import { notifyOutboxOperationalAlerts } from "@/features/platform-alerts/service";
import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";

function makeSummary(): OutboxSummary {
  return {
    pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 1,
    sentCount: 0, retryableFailedCount: 0, stuckProcessingCount: 0,
    recoverableStuckCount: 0, oldestPendingCreatedAt: null,
    oldestFailedCreatedAt: null, recentErrorSamples: [],
  };
}

function makeAlerts(): OutboxOperationalAlert[] {
  return [{ level: "warning", code: "DEAD_EVENTS_EXIST", count: 1 }];
}

describe("notifyOutboxOperationalAlerts — suppression audit（Phase 18）", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSent.mockResolvedValue(undefined);
    mockAuditSuppressed.mockResolvedValue(undefined);
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("webhook cooldown suppress → reasons に 'webhook suppressed by cooldown' が入る", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;
    mockShouldSend.mockResolvedValue(false);

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.reasons.some((r) => r.includes("webhook suppressed by cooldown"))).toBe(true);
    expect(result.suppressedByCooldown).toBe(true);
  });

  it("mail cooldown suppress → reasons に 'mail suppressed by cooldown' が入る", async () => {
    delete process.env.OUTBOX_ALERT_WEBHOOK_URL;
    process.env.OUTBOX_ALERT_EMAIL_TO = "ops@example.com";
    mockShouldSend.mockResolvedValue(false);

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "production",
    });

    expect(result.reasons.some((r) => r.includes("mail suppressed by cooldown"))).toBe(true);
    expect(result.suppressedByCooldown).toBe(true);
  });

  it("suppression 発生時に auditOutboxAlertSuppressed が呼ばれる", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;
    mockShouldSend.mockResolvedValue(false);

    await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(mockAuditSuppressed).toHaveBeenCalledOnce();
    const [meta] = mockAuditSuppressed.mock.calls[0];
    expect(meta.channels).toContain("webhook");
    expect(meta.environment).toBe("staging");
  });

  it("suppression なしの場合は auditOutboxAlertSuppressed は呼ばれない", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;
    mockShouldSend.mockResolvedValue(true);
    mockWebhookDispatch.mockResolvedValue({ ok: true, providerMessageId: null });

    await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(mockAuditSuppressed).not.toHaveBeenCalled();
  });
});
