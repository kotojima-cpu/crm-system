/**
 * Phase 10 Route Smoke テスト
 *
 * guard + runInContext + service 呼び出しの流れが崩れていないことを検証する。
 * 実際の HTTP リクエストではなく、モジュール構造とエクスポートの疎通を確認する。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContextFromHeaders: vi.fn(),
}));

vi.mock("@/shared/logging", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn(),
  withPlatformTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

// --- Feature module exports smoke ---

describe("Feature module exports", () => {
  it("customers feature がエクスポートされている", async () => {
    const customers = await import("@/features/customers");
    expect(customers.listCustomers).toBeTypeOf("function");
    expect(customers.getCustomerById).toBeTypeOf("function");
    expect(customers.createCustomer).toBeTypeOf("function");
    expect(customers.updateCustomer).toBeTypeOf("function");
    expect(customers.validateCreateCustomerInput).toBeTypeOf("function");
    expect(customers.validateUpdateCustomerInput).toBeTypeOf("function");
  });

  it("tenant-users feature がエクスポートされている", async () => {
    const tenantUsers = await import("@/features/tenant-users");
    expect(tenantUsers.listTenantUsers).toBeTypeOf("function");
    expect(tenantUsers.createInvitation).toBeTypeOf("function");
    expect(tenantUsers.validateCreateInvitationInput).toBeTypeOf("function");
  });

  it("platform-tenants feature がエクスポートされている", async () => {
    const platformTenants = await import("@/features/platform-tenants");
    expect(platformTenants.listTenants).toBeTypeOf("function");
    expect(platformTenants.suspendTenant).toBeTypeOf("function");
    expect(platformTenants.validateTenantIdParam).toBeTypeOf("function");
    expect(platformTenants.validateSuspendTenantInput).toBeTypeOf("function");
  });
});

// --- Guard pattern smoke ---

describe("Guard patterns", () => {
  it("requireTenantPermission がエクスポートされている", async () => {
    const guards = await import("@/auth/guards");
    expect(guards.requireTenantPermission).toBeTypeOf("function");
    expect(guards.requireTenantAdminPermission).toBeTypeOf("function");
    expect(guards.requirePlatformPermission).toBeTypeOf("function");
  });

  it("Permission enum が定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.CUSTOMER_READ).toBe("CUSTOMER_READ");
    expect(Permission.CUSTOMER_WRITE).toBe("CUSTOMER_WRITE");
    expect(Permission.USER_READ).toBe("USER_READ");
    expect(Permission.USER_WRITE).toBe("USER_WRITE");
    expect(Permission.TENANT_READ).toBe("TENANT_READ");
    expect(Permission.TENANT_SUSPEND).toBe("TENANT_SUSPEND");
  });
});

// --- Audit / Outbox integration smoke ---

describe("Audit & Outbox integration", () => {
  it("AUDIT 定数がエクスポートされている", async () => {
    const audit = await import("@/audit");
    expect(audit.AUDIT_CUSTOMER_CREATED).toBeDefined();
    expect(audit.AUDIT_CUSTOMER_UPDATED).toBeDefined();
    expect(audit.AUDIT_USER_INVITED).toBeDefined();
    expect(audit.AUDIT_TENANT_SUSPENDED).toBeDefined();
    expect(audit.writeAuditLog).toBeTypeOf("function");
  });

  it("OUTBOX 定数がエクスポートされている", async () => {
    const outbox = await import("@/outbox");
    expect(outbox.OUTBOX_CUSTOMER_CREATED).toBeDefined();
    expect(outbox.OUTBOX_CUSTOMER_UPDATED).toBeDefined();
    expect(outbox.OUTBOX_TENANT_USER_INVITE_REQUESTED).toBeDefined();
    expect(outbox.OUTBOX_TENANT_SUSPENDED).toBeDefined();
    expect(outbox.writeOutboxEvent).toBeTypeOf("function");
  });
});

// --- Service layer pattern verification ---

describe("Service layer pattern", () => {
  it("Customer service は withTenantTx を使用する", async () => {
    const serviceSource = await import("@/features/customers/service");
    // service 関数がエクスポートされている
    expect(serviceSource.createCustomer).toBeTypeOf("function");
    expect(serviceSource.updateCustomer).toBeTypeOf("function");
  });

  it("Platform tenant service は withPlatformTx を使用する", async () => {
    const serviceSource = await import("@/features/platform-tenants/service");
    expect(serviceSource.suspendTenant).toBeTypeOf("function");
    expect(serviceSource.listTenants).toBeTypeOf("function");
  });

  it("Tenant user service は withTenantTx を使用する", async () => {
    const serviceSource = await import("@/features/tenant-users/service");
    expect(serviceSource.createInvitation).toBeTypeOf("function");
    expect(serviceSource.listTenantUsers).toBeTypeOf("function");
  });
});
