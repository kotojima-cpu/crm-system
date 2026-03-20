import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const { LocalMailer } = await import("@/infrastructure/mail/local-mailer");
const { SesMailer } = await import("@/infrastructure/mail/ses-mailer");
const { LocalQueue } = await import("@/infrastructure/queue/local-queue");
const { SqsQueue } = await import("@/infrastructure/queue/sqs-queue");
const { LocalWebhook } = await import("@/infrastructure/webhook/local-webhook");
const { HttpWebhook } = await import("@/infrastructure/webhook/http-webhook");
const { EnvSecretProvider } = await import("@/infrastructure/secrets/env-secret-provider");
const { SecretsManagerProvider } = await import("@/infrastructure/secrets/secrets-manager-provider");
const { LocalEventBus } = await import("@/infrastructure/eventbus/local-eventbus");
const { EventBridgePublisher } = await import("@/infrastructure/eventbus/eventbridge-publisher");
const { LocalStorage } = await import("@/infrastructure/storage/local-storage");
const { S3Storage } = await import("@/infrastructure/storage/s3-storage");
const { LocalLoggerAdapter } = await import("@/infrastructure/logging/local-logger-adapter");
const { CloudWatchLoggerAdapter } = await import("@/infrastructure/logging/cloudwatch-logger-adapter");

async function importFactory() {
  return import("@/infrastructure/factory");
}

describe("Infrastructure Factory", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("local モード", () => {
    beforeEach(() => {
      process.env.INFRASTRUCTURE_MODE = "local";
    });

    it("createMailer → LocalMailer", async () => {
      const { createMailer } = await importFactory();
      expect(createMailer()).toBeInstanceOf(LocalMailer);
    });

    it("createQueuePublisher → LocalQueue", async () => {
      const { createQueuePublisher } = await importFactory();
      expect(createQueuePublisher()).toBeInstanceOf(LocalQueue);
    });

    it("createWebhookDispatcher → LocalWebhook", async () => {
      const { createWebhookDispatcher } = await importFactory();
      expect(createWebhookDispatcher()).toBeInstanceOf(LocalWebhook);
    });

    it("createSecretProvider → EnvSecretProvider", async () => {
      const { createSecretProvider } = await importFactory();
      expect(createSecretProvider()).toBeInstanceOf(EnvSecretProvider);
    });

    it("createEventBusPublisher → LocalEventBus", async () => {
      const { createEventBusPublisher } = await importFactory();
      expect(createEventBusPublisher()).toBeInstanceOf(LocalEventBus);
    });

    it("createObjectStorage → LocalStorage", async () => {
      const { createObjectStorage } = await importFactory();
      expect(createObjectStorage()).toBeInstanceOf(LocalStorage);
    });

    it("createLoggerAdapter → LocalLoggerAdapter", async () => {
      const { createLoggerAdapter } = await importFactory();
      expect(createLoggerAdapter()).toBeInstanceOf(LocalLoggerAdapter);
    });
  });

  describe("aws モード", () => {
    beforeEach(() => {
      process.env.INFRASTRUCTURE_MODE = "aws";
    });

    it("createMailer → SesMailer", async () => {
      const { createMailer } = await importFactory();
      expect(createMailer()).toBeInstanceOf(SesMailer);
    });

    it("createQueuePublisher → SqsQueue", async () => {
      const { createQueuePublisher } = await importFactory();
      expect(createQueuePublisher()).toBeInstanceOf(SqsQueue);
    });

    it("createWebhookDispatcher → HttpWebhook", async () => {
      const { createWebhookDispatcher } = await importFactory();
      expect(createWebhookDispatcher()).toBeInstanceOf(HttpWebhook);
    });

    it("createSecretProvider → SecretsManagerProvider", async () => {
      const { createSecretProvider } = await importFactory();
      expect(createSecretProvider()).toBeInstanceOf(SecretsManagerProvider);
    });

    it("createEventBusPublisher → EventBridgePublisher", async () => {
      const { createEventBusPublisher } = await importFactory();
      expect(createEventBusPublisher()).toBeInstanceOf(EventBridgePublisher);
    });

    it("createObjectStorage → S3Storage", async () => {
      const { createObjectStorage } = await importFactory();
      expect(createObjectStorage()).toBeInstanceOf(S3Storage);
    });

    it("createLoggerAdapter → CloudWatchLoggerAdapter", async () => {
      const { createLoggerAdapter } = await importFactory();
      expect(createLoggerAdapter()).toBeInstanceOf(CloudWatchLoggerAdapter);
    });
  });
});

// --- Config テスト ---

describe("Infrastructure Config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("getRuntimeEnvironment — デフォルトは local", async () => {
    delete process.env.APP_ENV;
    const { getRuntimeEnvironment } = await import("@/infrastructure/config");
    expect(getRuntimeEnvironment()).toBe("local");
  });

  it("getRuntimeEnvironment — production", async () => {
    process.env.APP_ENV = "production";
    const { getRuntimeEnvironment } = await import("@/infrastructure/config");
    expect(getRuntimeEnvironment()).toBe("production");
  });

  it("isExternalSendAllowed — production は常に true", async () => {
    process.env.APP_ENV = "production";
    const { isExternalSendAllowed } = await import("@/infrastructure/config");
    expect(isExternalSendAllowed(false)).toBe(true);
    expect(isExternalSendAllowed(true)).toBe(true);
  });

  it("isExternalSendAllowed — staging + flag=false → true", async () => {
    process.env.APP_ENV = "staging";
    const { isExternalSendAllowed } = await import("@/infrastructure/config");
    expect(isExternalSendAllowed(false)).toBe(true);
  });

  it("isExternalSendAllowed — staging + flag=true → false", async () => {
    process.env.APP_ENV = "staging";
    const { isExternalSendAllowed } = await import("@/infrastructure/config");
    expect(isExternalSendAllowed(true)).toBe(false);
  });

  it("isExternalSendAllowed — local は常に false", async () => {
    process.env.APP_ENV = "local";
    const { isExternalSendAllowed } = await import("@/infrastructure/config");
    expect(isExternalSendAllowed(false)).toBe(false);
  });
});

// --- Allowlist テスト ---

describe("Allowlist", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isAllowedEmailRecipient", () => {
    it("production → 常に許可", async () => {
      process.env.APP_ENV = "production";
      const { isAllowedEmailRecipient } = await import("@/infrastructure/config");
      expect(isAllowedEmailRecipient("anyone@anywhere.com")).toBe(true);
    });

    it("staging + allowlist 一致 → 許可", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_EMAIL_DOMAINS = "test.local,example.com";
      const { isAllowedEmailRecipient } = await import("@/infrastructure/config");
      expect(isAllowedEmailRecipient("user@test.local")).toBe(true);
      expect(isAllowedEmailRecipient("admin@example.com")).toBe(true);
    });

    it("staging + allowlist 不一致 → 拒否", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_EMAIL_DOMAINS = "test.local";
      const { isAllowedEmailRecipient } = await import("@/infrastructure/config");
      expect(isAllowedEmailRecipient("user@blocked.com")).toBe(false);
    });

    it("staging + allowlist 未設定 → 全拒否", async () => {
      process.env.APP_ENV = "staging";
      delete process.env.ALLOWED_EMAIL_DOMAINS;
      const { isAllowedEmailRecipient } = await import("@/infrastructure/config");
      expect(isAllowedEmailRecipient("user@test.local")).toBe(false);
    });

    it("不正なメールアドレス → 拒否", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_EMAIL_DOMAINS = "test.local";
      const { isAllowedEmailRecipient } = await import("@/infrastructure/config");
      expect(isAllowedEmailRecipient("no-at-sign")).toBe(false);
    });
  });

  describe("isAllowedWebhookEndpoint", () => {
    it("production → 常に許可", async () => {
      process.env.APP_ENV = "production";
      const { isAllowedWebhookEndpoint } = await import("@/infrastructure/config");
      expect(isAllowedWebhookEndpoint("https://any.host.com/hook")).toBe(true);
    });

    it("staging + allowlist 一致 → 許可", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_WEBHOOK_HOSTS = "hooks.staging.local,httpbin.org";
      const { isAllowedWebhookEndpoint } = await import("@/infrastructure/config");
      expect(isAllowedWebhookEndpoint("https://hooks.staging.local/callback")).toBe(true);
      expect(isAllowedWebhookEndpoint("https://httpbin.org/post")).toBe(true);
    });

    it("staging + allowlist 不一致 → 拒否", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_WEBHOOK_HOSTS = "hooks.staging.local";
      const { isAllowedWebhookEndpoint } = await import("@/infrastructure/config");
      expect(isAllowedWebhookEndpoint("https://evil.com/hook")).toBe(false);
    });

    it("staging + allowlist 未設定 → 全拒否", async () => {
      process.env.APP_ENV = "staging";
      delete process.env.ALLOWED_WEBHOOK_HOSTS;
      const { isAllowedWebhookEndpoint } = await import("@/infrastructure/config");
      expect(isAllowedWebhookEndpoint("https://hooks.staging.local/callback")).toBe(false);
    });

    it("不正な URL → 拒否", async () => {
      process.env.APP_ENV = "staging";
      process.env.ALLOWED_WEBHOOK_HOSTS = "hooks.staging.local";
      const { isAllowedWebhookEndpoint } = await import("@/infrastructure/config");
      expect(isAllowedWebhookEndpoint("not-a-url")).toBe(false);
    });
  });
});
