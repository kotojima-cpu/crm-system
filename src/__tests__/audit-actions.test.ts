import { describe, it, expect } from "vitest";
import {
  AUDIT_CUSTOMER_CREATED,
  AUDIT_CUSTOMER_UPDATED,
  AUDIT_CUSTOMER_DELETED,
  AUDIT_CONTRACT_CREATED,
  AUDIT_CONTRACT_UPDATED,
  AUDIT_CONTRACT_DELETED,
  AUDIT_INVOICE_CREATED,
  AUDIT_INVOICE_CONFIRMED,
  AUDIT_INVOICE_CANCELLED,
  AUDIT_USER_CREATED,
  AUDIT_USER_UPDATED,
  AUDIT_USER_INVITED,
  AUDIT_TENANT_CREATED,
  AUDIT_TENANT_SUSPENDED,
  AUDIT_TENANT_RESUMED,
  AUDIT_AUTH_LOGIN,
  AUDIT_AUTH_LOGOUT,
} from "@/audit/actions";

describe("AuditEventDef 定数", () => {
  it("顧客系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_CUSTOMER_CREATED).toEqual({ action: "create", resourceType: "customer" });
    expect(AUDIT_CUSTOMER_UPDATED).toEqual({ action: "update", resourceType: "customer" });
    expect(AUDIT_CUSTOMER_DELETED).toEqual({ action: "delete", resourceType: "customer" });
  });

  it("契約系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_CONTRACT_CREATED).toEqual({ action: "create", resourceType: "contract" });
    expect(AUDIT_CONTRACT_UPDATED).toEqual({ action: "update", resourceType: "contract" });
    expect(AUDIT_CONTRACT_DELETED).toEqual({ action: "delete", resourceType: "contract" });
  });

  it("請求書系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_INVOICE_CREATED).toEqual({ action: "create", resourceType: "invoice" });
    expect(AUDIT_INVOICE_CONFIRMED).toEqual({ action: "confirm", resourceType: "invoice" });
    expect(AUDIT_INVOICE_CANCELLED).toEqual({ action: "cancel", resourceType: "invoice" });
  });

  it("ユーザー系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_USER_CREATED).toEqual({ action: "create", resourceType: "user" });
    expect(AUDIT_USER_UPDATED).toEqual({ action: "update", resourceType: "user" });
    expect(AUDIT_USER_INVITED).toEqual({ action: "invite", resourceType: "user" });
  });

  it("テナント系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_TENANT_CREATED).toEqual({ action: "create", resourceType: "tenant" });
    expect(AUDIT_TENANT_SUSPENDED).toEqual({ action: "suspend", resourceType: "tenant" });
    expect(AUDIT_TENANT_RESUMED).toEqual({ action: "resume", resourceType: "tenant" });
  });

  it("認証系の定数が正しい action/resourceType を持つ", () => {
    expect(AUDIT_AUTH_LOGIN).toEqual({ action: "login", resourceType: "auth" });
    expect(AUDIT_AUTH_LOGOUT).toEqual({ action: "logout", resourceType: "auth" });
  });

  it("スプレッドで WriteAuditLogInput に展開できる", () => {
    const input = {
      ...AUDIT_CUSTOMER_CREATED,
      result: "success" as const,
      recordId: 42,
    };
    expect(input.action).toBe("create");
    expect(input.resourceType).toBe("customer");
    expect(input.result).toBe("success");
    expect(input.recordId).toBe(42);
  });
});
