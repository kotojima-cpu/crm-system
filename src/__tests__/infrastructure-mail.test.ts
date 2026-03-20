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

import type { MailSendInput } from "@/infrastructure/mail/types";

function makeInput(overrides: Partial<MailSendInput> = {}): MailSendInput {
  return {
    to: "test@example.com",
    subject: "テスト件名",
    text: "テスト本文",
    tenantId: 1,
    actorUserId: 10,
    requestId: "req-mail-001",
    executionContext: "tenant",
    ...overrides,
  };
}

// --- LocalMailer ---

describe("LocalMailer", () => {
  it("実送信せず dryRun: true を返す", async () => {
    const mailer = new LocalMailer();
    const result = await mailer.send(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.providerMessageId).toContain("local-dry-run-");
    }
  });

  it("sent 配列に入力が保持される", async () => {
    const mailer = new LocalMailer();
    await mailer.send(makeInput({ requestId: "req-custom", tenantId: 5 }));
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].requestId).toBe("req-custom");
    expect(mailer.sent[0].tenantId).toBe(5);
  });

  it("複数宛先を受け付ける", async () => {
    const mailer = new LocalMailer();
    const result = await mailer.send(
      makeInput({ to: ["a@test.com", "b@test.com"] }),
    );
    expect(result.ok).toBe(true);
  });

  it("tenantId null でも動作する", async () => {
    const mailer = new LocalMailer();
    const result = await mailer.send(makeInput({ tenantId: null }));
    expect(result.ok).toBe(true);
  });
});

// --- SesMailer ---

describe("SesMailer", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("local 環境では dryRun + blocked を返す", async () => {
    process.env.APP_ENV = "local";
    const mailer = new SesMailer();
    const result = await mailer.send(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.providerMessageId).toBeNull();
    }
  });

  it("staging + DISABLE_REAL_EMAIL_SEND=true → blocked", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_EMAIL_SEND = "true";
    const mailer = new SesMailer();
    const result = await mailer.send(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocked).toBe(true);
    }
  });

  it("staging + allowlist 外宛先 → blocked", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_EMAIL_SEND = "false";
    process.env.ALLOWED_EMAIL_DOMAINS = "allowed.local";
    const mailer = new SesMailer();
    const result = await mailer.send(makeInput({ to: "user@blocked.com" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBe(true);
      expect(result.blocked).toBe(true);
    }
  });

  it("staging + allowlist 内宛先 → 送信（stub）", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_EMAIL_SEND = "false";
    process.env.ALLOWED_EMAIL_DOMAINS = "allowed.local";
    const mailer = new SesMailer();
    const result = await mailer.send(makeInput({ to: "user@allowed.local" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 送信が通る（stub だが dryRun/blocked はつかない）
      expect(result.dryRun).toBeUndefined();
      expect(result.blocked).toBeUndefined();
    }
  });

  it("staging + 複数宛先で一部のみ許可 → 許可分だけ送信", async () => {
    process.env.APP_ENV = "staging";
    process.env.DISABLE_REAL_EMAIL_SEND = "false";
    process.env.ALLOWED_EMAIL_DOMAINS = "allowed.local";
    const mailer = new SesMailer();
    const result = await mailer.send(
      makeInput({ to: ["user@allowed.local", "user@blocked.com"] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 許可された宛先だけ送信される（blocked はログに記録）
      expect(result.providerMessageId).toContain("ses-stub-");
    }
  });

  it("production → allowlist 関係なく送信", async () => {
    process.env.APP_ENV = "production";
    const mailer = new SesMailer();
    const result = await mailer.send(makeInput({ to: "anyone@anywhere.com" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dryRun).toBeUndefined();
    }
  });

  it("requestId / tenantId / executionContext が入力に含まれる", async () => {
    const input = makeInput({
      requestId: "req-ctx",
      tenantId: 99,
      executionContext: "platform",
    });
    expect(input.requestId).toBe("req-ctx");
    expect(input.tenantId).toBe(99);
    expect(input.executionContext).toBe("platform");
  });
});
