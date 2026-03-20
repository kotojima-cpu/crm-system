import { describe, it, expect } from "vitest";
import {
  resolveEffectiveTenantId,
  resolveTargetTenantId,
  sanitizeAuditMetadata,
  safeJsonStringify,
} from "@/audit/helpers";
import type { TenantId } from "@/shared/types";

function tid(n: number): TenantId {
  return n as TenantId;
}

// ============================================================
// resolveEffectiveTenantId
// ============================================================
describe("resolveEffectiveTenantId", () => {
  it("tenant コンテキストでは JWT tenantId を返す", () => {
    const result = resolveEffectiveTenantId({
      executionContext: "tenant",
      jwtTenantId: tid(1),
      targetTenantId: tid(99),
    });
    expect(result).toBe(1);
  });

  it("platform コンテキストでは targetTenantId を返す", () => {
    const result = resolveEffectiveTenantId({
      executionContext: "platform",
      jwtTenantId: null,
      targetTenantId: tid(5),
    });
    expect(result).toBe(5);
  });

  it("platform コンテキストで targetTenantId がなければ null", () => {
    const result = resolveEffectiveTenantId({
      executionContext: "platform",
      jwtTenantId: null,
    });
    expect(result).toBeNull();
  });

  it("system コンテキストでは常に null", () => {
    const result = resolveEffectiveTenantId({
      executionContext: "system",
      jwtTenantId: tid(1),
      targetTenantId: tid(2),
    });
    expect(result).toBeNull();
  });
});

// ============================================================
// resolveTargetTenantId
// ============================================================
describe("resolveTargetTenantId", () => {
  it("platform コンテキストでは targetTenantId を返す", () => {
    const result = resolveTargetTenantId({
      executionContext: "platform",
      targetTenantId: tid(5),
    });
    expect(result).toBe(5);
  });

  it("tenant コンテキストでは常に null", () => {
    const result = resolveTargetTenantId({
      executionContext: "tenant",
      targetTenantId: tid(5),
    });
    expect(result).toBeNull();
  });

  it("system コンテキストでは常に null", () => {
    const result = resolveTargetTenantId({
      executionContext: "system",
      targetTenantId: tid(5),
    });
    expect(result).toBeNull();
  });
});

// ============================================================
// sanitizeAuditMetadata
// ============================================================
describe("sanitizeAuditMetadata", () => {
  it("null/undefined の場合は null を返す", () => {
    expect(sanitizeAuditMetadata(null)).toBeNull();
    expect(sanitizeAuditMetadata(undefined)).toBeNull();
  });

  it("空オブジェクトの場合は null を返す", () => {
    expect(sanitizeAuditMetadata({})).toBeNull();
  });

  it("通常のフィールドはそのまま出力される", () => {
    const result = sanitizeAuditMetadata({ companyName: "テスト株式会社", count: 42 });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.companyName).toBe("テスト株式会社");
    expect(parsed.count).toBe(42);
  });

  it("機密キー（password）は [REDACTED] に置換される", () => {
    const result = sanitizeAuditMetadata({
      loginId: "user1",
      password: "secret123",
      passwordHash: "$2b$10$xxx",
    });
    const parsed = JSON.parse(result!);
    expect(parsed.loginId).toBe("user1");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.passwordHash).toBe("[REDACTED]");
  });

  it("機密キー（token, secret, apiKey）は [REDACTED] に置換される", () => {
    const result = sanitizeAuditMetadata({
      accessToken: "eyJhbGciOi...",
      refreshToken: "rt_xxx",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      apiKey: "ak_xxx",
    });
    const parsed = JSON.parse(result!);
    expect(parsed.accessToken).toBe("[REDACTED]");
    expect(parsed.refreshToken).toBe("[REDACTED]");
    expect(parsed.twoFactorSecret).toBe("[REDACTED]");
    expect(parsed.apiKey).toBe("[REDACTED]");
  });

  it("authorization, cookie, creditCard, recoveryCode も [REDACTED]", () => {
    const result = sanitizeAuditMetadata({
      authorization: "Bearer xxx",
      cookie: "session=abc",
      creditCard: "4111-xxxx",
      recoveryCode: "ABC-123",
    });
    const parsed = JSON.parse(result!);
    expect(parsed.authorization).toBe("[REDACTED]");
    expect(parsed.cookie).toBe("[REDACTED]");
    expect(parsed.creditCard).toBe("[REDACTED]");
    expect(parsed.recoveryCode).toBe("[REDACTED]");
  });
});

// ============================================================
// safeJsonStringify
// ============================================================
describe("safeJsonStringify", () => {
  it("null/undefined の場合は null を返す", () => {
    expect(safeJsonStringify(null)).toBeNull();
    expect(safeJsonStringify(undefined)).toBeNull();
  });

  it("空オブジェクトの場合は null を返す", () => {
    expect(safeJsonStringify({})).toBeNull();
  });

  it("通常の値は JSON 文字列になる", () => {
    const result = safeJsonStringify({ name: "テスト", age: 25 });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.name).toBe("テスト");
    expect(parsed.age).toBe(25);
  });

  it("機密キーは [REDACTED] に置換される", () => {
    const result = safeJsonStringify({
      loginId: "user1",
      passwordHash: "$2b$10$xxx",
    });
    const parsed = JSON.parse(result!);
    expect(parsed.loginId).toBe("user1");
    expect(parsed.passwordHash).toBe("[REDACTED]");
  });

  it("循環参照はエラーにならずエラー JSON を返す", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = safeJsonStringify(obj);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed._error).toBeDefined();
  });
});
