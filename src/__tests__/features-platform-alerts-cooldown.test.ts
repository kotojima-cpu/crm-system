/**
 * platform-alerts cooldown 統合テスト
 *
 * notifyOutboxOperationalAlerts の cooldown 動作を検証する:
 * - shouldSendPlatformAlert が false → suppressedByCooldown=true
 * - shouldSendPlatformAlert が true → 通常送信
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
const mockBuildKey = vi.fn().mockReturnValue("DEAD_EVENTS_EXIST");

vi.mock("@/features/platform-alert-history", () => ({
  buildAlertDedupKey: (...args: unknown[]) => mockBuildKey(...args),
  shouldSendPlatformAlert: (...args: unknown[]) => mockShouldSend(...args),
  markPlatformAlertSent: (...args: unknown[]) => mockMarkSent(...args),
}));

import { notifyOutboxOperationalAlerts } from "@/features/platform-alerts/service";
import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";

function makeSummary(): OutboxSummary {
  return {
    pendingCount: 0, processingCount: 0, failedCount: 0, deadCount: 2, sentCount: 0,
    retryableFailedCount: 0, stuckProcessingCount: 0, recoverableStuckCount: 0,
    oldestPendingCreatedAt: null, oldestFailedCreatedAt: null, recentErrorSamples: [],
  };
}

function makeAlerts(): OutboxOperationalAlert[] {
  return [{ level: "warning", code: "DEAD_EVENTS_EXIST", count: 2 }];
}

describe("notifyOutboxOperationalAlerts — cooldown 制御", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSent.mockResolvedValue(undefined);
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it("webhook cooldown 中 → suppressedByCooldown=true, suppressedChannels に webhook", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;

    // webhook は cooldown 中
    mockShouldSend.mockResolvedValue(false);

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.suppressedByCooldown).toBe(true);
    expect(result.suppressedChannels).toContain("webhook");
    expect(result.notifiedByWebhook).toBe(false);
    expect(result.skipped).toBe(false);
    expect(mockWebhookDispatch).not.toHaveBeenCalled();
  });

  it("mail cooldown 中 → suppressedChannels に mail", async () => {
    delete process.env.OUTBOX_ALERT_WEBHOOK_URL;
    process.env.OUTBOX_ALERT_EMAIL_TO = "ops@example.com";

    mockShouldSend.mockResolvedValue(false);

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.suppressedByCooldown).toBe(true);
    expect(result.suppressedChannels).toContain("mail");
    expect(result.notifiedByMail).toBe(false);
    expect(mockMailSend).not.toHaveBeenCalled();
  });

  it("cooldown なし → 通常送信、markPlatformAlertSent が呼ばれる", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    delete process.env.OUTBOX_ALERT_EMAIL_TO;

    mockShouldSend.mockResolvedValue(true);
    mockWebhookDispatch.mockResolvedValue({ ok: true, providerMessageId: null });

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "staging",
    });

    expect(result.suppressedByCooldown).toBe(false);
    expect(result.suppressedChannels).toHaveLength(0);
    expect(result.notifiedByWebhook).toBe(true);
    expect(mockMarkSent).toHaveBeenCalledOnce();
  });

  it("両チャネル cooldown 中 → suppressedChannels に webhook と mail の両方", async () => {
    process.env.OUTBOX_ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    process.env.OUTBOX_ALERT_EMAIL_TO = "ops@example.com";

    mockShouldSend.mockResolvedValue(false);

    const result = await notifyOutboxOperationalAlerts({
      summary: makeSummary(),
      alerts: makeAlerts(),
      triggeredAt: new Date(),
      environment: "production",
    });

    expect(result.suppressedByCooldown).toBe(true);
    expect(result.suppressedChannels).toContain("webhook");
    expect(result.suppressedChannels).toContain("mail");
    expect(result.skipped).toBe(false);
  });
});
