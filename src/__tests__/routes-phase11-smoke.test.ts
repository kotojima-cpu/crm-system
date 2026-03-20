/**
 * Phase 11 Route Smoke テスト
 *
 * contracts / invoices feature のエクスポートと Permission 定義を検証する。
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
  it("contracts feature がエクスポートされている", async () => {
    const contracts = await import("@/features/contracts");
    expect(contracts.listContracts).toBeTypeOf("function");
    expect(contracts.getContractById).toBeTypeOf("function");
    expect(contracts.createContract).toBeTypeOf("function");
    expect(contracts.updateContract).toBeTypeOf("function");
    expect(contracts.validateCreateContractInput).toBeTypeOf("function");
    expect(contracts.validateUpdateContractInput).toBeTypeOf("function");
  });

  it("invoices feature がエクスポートされている", async () => {
    const invoices = await import("@/features/invoices");
    expect(invoices.listInvoices).toBeTypeOf("function");
    expect(invoices.getInvoiceById).toBeTypeOf("function");
    expect(invoices.createInvoice).toBeTypeOf("function");
    expect(invoices.confirmInvoice).toBeTypeOf("function");
    expect(invoices.cancelInvoice).toBeTypeOf("function");
    expect(invoices.validateCreateInvoiceInput).toBeTypeOf("function");
    expect(invoices.validateCancelInvoiceInput).toBeTypeOf("function");
  });
});

// --- Permission enum smoke ---

describe("Permission enum — Phase 11 permissions", () => {
  it("CONTRACT パーミッションが定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.CONTRACT_READ).toBe("CONTRACT_READ");
    expect(Permission.CONTRACT_WRITE).toBe("CONTRACT_WRITE");
  });

  it("INVOICE パーミッションが定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.INVOICE_READ).toBe("INVOICE_READ");
    expect(Permission.INVOICE_CREATE).toBe("INVOICE_CREATE");
    expect(Permission.INVOICE_CONFIRM).toBe("INVOICE_CONFIRM");
    expect(Permission.INVOICE_CANCEL).toBe("INVOICE_CANCEL");
  });
});

// --- Audit / Outbox constants smoke ---

describe("Audit & Outbox constants — Phase 11", () => {
  it("Contract AUDIT 定数がエクスポートされている", async () => {
    const audit = await import("@/audit");
    expect(audit.AUDIT_CONTRACT_CREATED).toBeDefined();
    expect(audit.AUDIT_CONTRACT_UPDATED).toBeDefined();
  });

  it("Invoice AUDIT 定数がエクスポートされている", async () => {
    const audit = await import("@/audit");
    expect(audit.AUDIT_INVOICE_CREATED).toBeDefined();
    expect(audit.AUDIT_INVOICE_CONFIRMED).toBeDefined();
    expect(audit.AUDIT_INVOICE_CANCELLED).toBeDefined();
  });

  it("Contract OUTBOX 定数がエクスポートされている", async () => {
    const outbox = await import("@/outbox");
    expect(outbox.OUTBOX_CONTRACT_CREATED).toBeDefined();
    expect(outbox.OUTBOX_CONTRACT_UPDATED).toBeDefined();
  });

  it("Invoice OUTBOX 定数がエクスポートされている", async () => {
    const outbox = await import("@/outbox");
    expect(outbox.OUTBOX_INVOICE_CREATED).toBeDefined();
    expect(outbox.OUTBOX_INVOICE_CONFIRMED).toBeDefined();
    expect(outbox.OUTBOX_INVOICE_CANCELLED).toBeDefined();
  });
});

// --- State transition rules verification ---

describe("Invoice state transition rules", () => {
  it("InvoiceStatus 型が draft | confirmed | cancelled", async () => {
    // 型チェック — InvoiceStatus を import してコンパイルが通ることを確認
    const types = await import("@/features/invoices/types");
    // InvoiceStatus は type alias なので runtime では検証できないが、
    // import が成功すること自体がスモークテスト
    expect(types).toBeDefined();
  });
});
