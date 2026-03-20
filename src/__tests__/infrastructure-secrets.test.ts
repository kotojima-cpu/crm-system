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

const { EnvSecretProvider } = await import("@/infrastructure/secrets/env-secret-provider");
const { SecretResolutionError } = await import("@/infrastructure/secrets/types");

describe("EnvSecretProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // テスト用環境変数を設定
    process.env.DB_CONNECTION = "postgresql://localhost:5432/test";
    process.env.API_KEY = "test-api-key-value";
    process.env.JSON_CONFIG = JSON.stringify({ host: "localhost", port: 5432 });
  });

  afterEach(() => {
    // 環境変数を元に戻す
    process.env = { ...originalEnv };
  });

  it("環境変数から secret を取得する", async () => {
    const provider = new EnvSecretProvider();
    const value = await provider.getSecret("db/connection");
    expect(value).toBe("postgresql://localhost:5432/test");
  });

  it("secret 名を大文字スネークケースに変換する", async () => {
    const provider = new EnvSecretProvider();
    const value = await provider.getSecret("api-key");
    expect(value).toBe("test-api-key-value");
  });

  it("missing secret でエラー", async () => {
    const provider = new EnvSecretProvider();
    await expect(provider.getSecret("nonexistent/secret")).rejects.toThrow(
      SecretResolutionError,
    );
  });

  it("空文字列 secret でエラー", async () => {
    process.env.EMPTY_SECRET = "";
    const provider = new EnvSecretProvider();
    await expect(provider.getSecret("empty/secret")).rejects.toThrow(
      SecretResolutionError,
    );
  });

  it("getJsonSecret が JSON parse できる", async () => {
    const provider = new EnvSecretProvider();
    const config = await provider.getJsonSecret<{ host: string; port: number }>(
      "json/config",
    );
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(5432);
  });

  it("getJsonSecret で不正 JSON はエラー", async () => {
    process.env.BAD_JSON = "not-json";
    const provider = new EnvSecretProvider();
    await expect(provider.getJsonSecret("bad/json")).rejects.toThrow(
      "Failed to parse JSON secret",
    );
  });
});
