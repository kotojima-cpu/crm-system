/**
 * Phase 12 Route Smoke テスト
 *
 * billing-batch feature / worker handlers / dispatcher のエクスポートを検証する。
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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn(),
  withPlatformTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

vi.mock("@/infrastructure", () => ({
  createMailer: vi.fn(() => ({ send: vi.fn() })),
  createWebhookDispatcher: vi.fn(() => ({ dispatch: vi.fn() })),
  createQueuePublisher: vi.fn(() => ({ publish: vi.fn() })),
  createEventBusPublisher: vi.fn(() => ({ publish: vi.fn() })),
}));

// --- Feature module exports smoke ---

describe("Feature module exports — billing-batch", () => {
  it("billing-batch feature がエクスポートされている", async () => {
    const batch = await import("@/features/billing-batch");
    expect(batch.generateMonthlyInvoicesForTenant).toBeTypeOf("function");
    expect(batch.generateMonthlyInvoicesForAllTenants).toBeTypeOf("function");
    expect(batch.validateTargetMonth).toBeTypeOf("function");
    expect(batch.validateGenerateMonthlyInvoicesInput).toBeTypeOf("function");
  });
});

// --- Worker handler exports smoke ---

describe("Worker handler exports", () => {
  it("invoice.created handler がエクスポートされている", async () => {
    const { handleInvoiceCreated } = await import(
      "@/worker/handlers/invoice-created"
    );
    expect(handleInvoiceCreated).toBeTypeOf("function");
  });

  it("invoice.confirmed handler がエクスポートされている", async () => {
    const { handleInvoiceConfirmed } = await import(
      "@/worker/handlers/invoice-confirmed"
    );
    expect(handleInvoiceConfirmed).toBeTypeOf("function");
  });

  it("tenant-user.invite.requested handler がエクスポートされている", async () => {
    const { handleTenantUserInviteRequested } = await import(
      "@/worker/handlers/tenant-user-invite-requested"
    );
    expect(handleTenantUserInviteRequested).toBeTypeOf("function");
  });

  it("tenant.suspended handler がエクスポートされている", async () => {
    const { handleTenantSuspended } = await import(
      "@/worker/handlers/tenant-suspended"
    );
    expect(handleTenantSuspended).toBeTypeOf("function");
  });

  it("createRegisteredHandlerMap で全 handler が登録される", async () => {
    const { createRegisteredHandlerMap } = await import(
      "@/worker/handlers/index"
    );
    const map = createRegisteredHandlerMap();
    expect(map.get("invoice.created")).toBeTypeOf("function");
    expect(map.get("invoice.confirmed")).toBeTypeOf("function");
    expect(map.get("tenant-user.invite.requested")).toBeTypeOf("function");
    expect(map.get("tenant.suspended")).toBeTypeOf("function");
  });
});

// --- Permission smoke ---

describe("Permission enum — Phase 12", () => {
  it("BATCH_EXECUTE パーミッションが定義されている", async () => {
    const { Permission } = await import("@/auth/permissions");
    expect(Permission.BATCH_EXECUTE).toBe("BATCH_EXECUTE");
  });
});

// --- Outbox dispatcher smoke ---

describe("Outbox dispatcher — resolveDispatchHandlerForMode", () => {
  it("resolveDispatchHandlerForMode がエクスポートされている", async () => {
    const { resolveDispatchHandlerForMode } = await import("@/outbox");
    expect(resolveDispatchHandlerForMode).toBeTypeOf("function");
  });

  it("queue/email/webhook/internal の各モードで handler を返す", async () => {
    const { resolveDispatchHandlerForMode } = await import("@/outbox");
    expect(resolveDispatchHandlerForMode("queue")).toBeTypeOf("function");
    expect(resolveDispatchHandlerForMode("email")).toBeTypeOf("function");
    expect(resolveDispatchHandlerForMode("webhook")).toBeTypeOf("function");
    expect(resolveDispatchHandlerForMode("eventbus")).toBeTypeOf("function");
    expect(resolveDispatchHandlerForMode("internal")).toBeTypeOf("function");
  });
});
