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

const { LocalWebhook } = await import("@/infrastructure/webhook/local-webhook");
const { HttpWebhook } = await import("@/infrastructure/webhook/http-webhook");

import type { WebhookDispatchInput } from "@/infrastructure/webhook/types";

function makeInput(overrides: Partial<WebhookDispatchInput> = {}): WebhookDispatchInput {
  return {
    endpoint: "https://hooks.example.com/callback",
    eventType: "tenant.suspended",
    body: { tenantId: 1, tenantName: "テスト" },
    requestId: "req-wh-001",
    tenantId: 1,
    actorUserId: 10,
    executionContext: "platform",
    ...overrides,
  };
}

// --- LocalWebhook ---

describe("LocalWebhook", () => {
  it("実送信せず dryRun を返す", async () => {
    const webhook = new LocalWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.providerMessageId).toContain("local-webhook-dry-run-");
    }
  });

  it("requestId / tenantId が保持される", async () => {
    const webhook = new LocalWebhook();
    const input = makeInput({
      requestId: "req-custom",
      tenantId: 5,
      headers: { "X-Custom": "value" },
    });
    await webhook.dispatch(input);
    expect(webhook.dispatched).toHaveLength(1);
    expect(webhook.dispatched[0].requestId).toBe("req-custom");
    expect(webhook.dispatched[0].tenantId).toBe(5);
    expect(webhook.dispatched[0].headers?.["X-Custom"]).toBe("value");
  });

  it("tenantId null でも動作する", async () => {
    const webhook = new LocalWebhook();
    const result = await webhook.dispatch(makeInput({ tenantId: null }));
    expect(result.ok).toBe(true);
  });

  it("dispatched にイベントが蓄積される", async () => {
    const webhook = new LocalWebhook();
    await webhook.dispatch(makeInput({ eventType: "a" }));
    await webhook.dispatch(makeInput({ eventType: "b" }));
    expect(webhook.dispatched).toHaveLength(2);
  });
});

// --- HttpWebhook ---

describe("HttpWebhook", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("local 環境では dryRun + blocked を返す", async () => {
    process.env.APP_ENV = "local";
    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.blocked).toBe(true);
    }
  });

  it("staging + DISABLE_REAL_WEBHOOK_SEND=true → blocked", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_WEBHOOK_SEND = "true";
    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(true);
    }
  });

  it("staging + allowlist 外 host → blocked", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_WEBHOOK_SEND = "false";
    process.env.ALLOWED_WEBHOOK_HOSTS = "hooks.staging.local";
    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(
      makeInput({ endpoint: "https://evil.example.com/hook" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.blocked).toBe(true);
    }
  });

  it("staging + allowlist 内 host → 実送信（fetch 呼び出し）", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_WEBHOOK_SEND = "false";
    process.env.ALLOWED_WEBHOOK_HOSTS = "hooks.staging.local";

    // fetch をモック
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });
    vi.stubGlobal("fetch", mockFetch);

    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(
      makeInput({ endpoint: "https://hooks.staging.local/callback" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBeUndefined();
    }

    // fetch が呼ばれたことを確認
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.staging.local/callback");
    expect(options.method).toBe("POST");

    // body に requestId が含まれる
    const body = JSON.parse(options.body);
    expect(body.requestId).toBe("req-wh-001");
    expect(body.event).toBe("tenant.suspended");

    // header に X-Request-Id が含まれる
    expect(options.headers["X-Request-Id"]).toBe("req-wh-001");

    vi.unstubAllGlobals();
  });

  it("fetch 5xx → retryable error", async () => {
    process.env.APP_ENV = "production";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    vi.stubGlobal("fetch", mockFetch);

    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("503");
    }

    vi.unstubAllGlobals();
  });

  it("fetch 4xx → non-retryable error", async () => {
    process.env.APP_ENV = "production";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    vi.stubGlobal("fetch", mockFetch);

    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
    }

    vi.unstubAllGlobals();
  });

  it("fetch network error → retryable", async () => {
    process.env.APP_ENV = "production";

    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    const webhook = new HttpWebhook();
    const result = await webhook.dispatch(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("ECONNREFUSED");
    }

    vi.unstubAllGlobals();
  });
});
