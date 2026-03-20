import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-001",
    executionContext: "tenant",
    tenantId: 1,
    actorUserId: 10,
    actorRole: "tenant_admin",
  }),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-001",
    executionContext: "tenant",
    tenantId: 1,
    actorUserId: 10,
    actorRole: "tenant_admin",
  }),
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

const mockTxClient = {
  invoice: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  leaseContract: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  outboxEvent: {
    create: vi.fn().mockResolvedValue({ id: 1 }),
  },
};

vi.mock("@/shared/db", () => ({
  withTenantTx: vi.fn((_tenantId: unknown, fn: (tx: unknown) => unknown) =>
    fn(mockTxClient),
  ),
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) => fn(mockTxClient)),
  withSystemTx: vi.fn((fn: (tx: unknown) => unknown) => fn(mockTxClient)),
  assertTenantOwnership: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhone: vi.fn(() => null),
}));

const { validateCreateInvoiceInput, validateCancelInvoiceInput } = await import(
  "@/features/invoices/validators"
);
const { listInvoices, getInvoiceById, createInvoice, confirmInvoice, cancelInvoice } =
  await import("@/features/invoices/service");
const {
  buildInvoiceCreatedAudit,
  buildInvoiceConfirmedAudit,
  buildInvoiceCancelledAudit,
} = await import("@/features/invoices/audit");
const {
  buildInvoiceCreatedOutbox,
  buildInvoiceConfirmedOutbox,
  buildInvoiceCancelledOutbox,
} = await import("@/features/invoices/outbox");

import type { TenantId, ActorUserId } from "@/shared/types";

function makeCtx() {
  return {
    tenantId: 1 as TenantId,
    actorUserId: 10 as ActorUserId,
    actorRole: "tenant_admin",
  };
}

const now = new Date();
const periodStart = new Date("2026-04-01");
const periodEnd = new Date("2026-04-30");

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 1,
    contractId: 100,
    customerId: 200,
    periodStart,
    periodEnd,
    amount: 50000,
    status: "draft",
    cancelReason: null,
    confirmedAt: null,
    cancelledAt: null,
    createdBy: 10,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// --- Validator テスト ---

describe("Invoice Validators", () => {
  describe("validateCreateInvoiceInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateCreateInvoiceInput({
        contractId: 1,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        amount: 50000,
      });
      expect(result.contractId).toBe(1);
      expect(result.amount).toBe(50000);
    });

    it("contractId 必須", () => {
      expect(() =>
        validateCreateInvoiceInput({
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
          amount: 50000,
        }),
      ).toThrow("契約ID");
    });

    it("periodStart 必須", () => {
      expect(() =>
        validateCreateInvoiceInput({
          contractId: 1,
          periodEnd: "2026-04-30",
          amount: 50000,
        }),
      ).toThrow("対象期間開始日");
    });

    it("periodEnd は periodStart より後", () => {
      expect(() =>
        validateCreateInvoiceInput({
          contractId: 1,
          periodStart: "2026-04-30",
          periodEnd: "2026-04-01",
          amount: 50000,
        }),
      ).toThrow("開始日より後");
    });

    it("amount 必須", () => {
      expect(() =>
        validateCreateInvoiceInput({
          contractId: 1,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
        }),
      ).toThrow("請求金額");
    });

    it("amount 負数拒否", () => {
      expect(() =>
        validateCreateInvoiceInput({
          contractId: 1,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
          amount: -1,
        }),
      ).toThrow("0以上");
    });

    it("amount 0 は許容", () => {
      const result = validateCreateInvoiceInput({
        contractId: 1,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        amount: 0,
      });
      expect(result.amount).toBe(0);
    });
  });

  describe("validateCancelInvoiceInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateCancelInvoiceInput({ reason: "二重請求のため" });
      expect(result.reason).toBe("二重請求のため");
    });

    it("reason 必須", () => {
      expect(() => validateCancelInvoiceInput({})).toThrow("キャンセル理由");
    });

    it("reason 空文字拒否", () => {
      expect(() => validateCancelInvoiceInput({ reason: "  " })).toThrow(
        "キャンセル理由",
      );
    });

    it("reason 1000文字超拒否", () => {
      expect(() =>
        validateCancelInvoiceInput({ reason: "a".repeat(1001) }),
      ).toThrow("1000文字以内");
    });
  });
});

// --- Audit helper テスト ---

describe("Invoice Audit Helpers", () => {
  it("buildInvoiceCreatedAudit — action/resourceType が正しい", () => {
    const invoice = makeInvoice();
    const audit = buildInvoiceCreatedAudit(invoice, 1 as TenantId);
    expect(audit.action).toBe("create");
    expect(audit.resourceType).toBe("invoice");
    expect(audit.recordId).toBe(1);
    expect(audit.result).toBe("success");
    expect(audit.newValues).toHaveProperty("amount", 50000);
    expect(audit.newValues).toHaveProperty("status", "draft");
  });

  it("buildInvoiceConfirmedAudit — old/new status が正しい", () => {
    const invoice = makeInvoice({ status: "confirmed", confirmedAt: now });
    const audit = buildInvoiceConfirmedAudit(invoice, 1 as TenantId);
    expect(audit.action).toBe("confirm");
    expect(audit.oldValues).toEqual({ status: "draft" });
    expect(audit.newValues).toHaveProperty("status", "confirmed");
  });

  it("buildInvoiceCancelledAudit — oldStatus を反映", () => {
    const invoice = makeInvoice({
      status: "cancelled",
      cancelReason: "二重",
      cancelledAt: now,
    });
    const audit = buildInvoiceCancelledAudit(invoice, "confirmed", 1 as TenantId);
    expect(audit.oldValues).toEqual({ status: "confirmed" });
    expect(audit.newValues).toHaveProperty("status", "cancelled");
    expect(audit.newValues).toHaveProperty("cancelReason", "二重");
  });
});

// --- Outbox helper テスト ---

describe("Invoice Outbox Helpers", () => {
  it("buildInvoiceCreatedOutbox — eventType が正しい", () => {
    const invoice = makeInvoice();
    const outbox = buildInvoiceCreatedOutbox(invoice, 1 as TenantId);
    expect(outbox.eventType).toBe("invoice.created");
    expect(outbox.resourceId).toBe(1);
    expect(outbox.payload).toHaveProperty("amount", 50000);
  });

  it("buildInvoiceConfirmedOutbox — eventType が正しい", () => {
    const invoice = makeInvoice({ status: "confirmed" });
    const outbox = buildInvoiceConfirmedOutbox(invoice, 1 as TenantId);
    expect(outbox.eventType).toBe("invoice.confirmed");
  });

  it("buildInvoiceCancelledOutbox — eventType が正しい", () => {
    const invoice = makeInvoice({ status: "cancelled", cancelReason: "テスト" });
    const outbox = buildInvoiceCancelledOutbox(invoice, 1 as TenantId);
    expect(outbox.eventType).toBe("invoice.cancelled");
    expect(outbox.payload).toHaveProperty("cancelReason", "テスト");
  });
});

// --- Service テスト ---

describe("Invoice Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listInvoices", () => {
    it("tenant スコープで一覧取得", async () => {
      const invoices = [
        {
          id: 1, contractId: 100, customerId: 200,
          periodStart, periodEnd, amount: 50000, status: "draft",
        },
      ];
      mockTxClient.invoice.findMany.mockResolvedValue(invoices);
      mockTxClient.invoice.count.mockResolvedValue(1);

      const result = await listInvoices(makeCtx(), {
        tenantId: 1 as TenantId,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      const whereArg = mockTxClient.invoice.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });
  });

  describe("getInvoiceById", () => {
    it("tenant スコープで単一取得", async () => {
      const invoice = makeInvoice();
      mockTxClient.invoice.findFirst.mockResolvedValue(invoice);

      const result = await getInvoiceById(makeCtx(), 1);
      expect(result.amount).toBe(50000);
    });

    it("存在しない請求は NotFound", async () => {
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      await expect(getInvoiceById(makeCtx(), 999)).rejects.toThrow("請求");
    });
  });

  describe("createInvoice", () => {
    it("新規作成 + AuditLog（created: true）", async () => {
      mockTxClient.leaseContract.findFirst.mockResolvedValue({
        id: 100, tenantId: 1, customerId: 200,
      });
      // 重複なし
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      const created = makeInvoice();
      mockTxClient.invoice.create.mockResolvedValue(created);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await createInvoice(makeCtx(), {
        contractId: 100,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        amount: 50000,
      });

      expect(result.created).toBe(true);
      expect(result.invoice.amount).toBe(50000);
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("冪等性: 同一期間の既存 draft → created: false", async () => {
      mockTxClient.leaseContract.findFirst.mockResolvedValue({
        id: 100, tenantId: 1, customerId: 200,
      });
      const existing = makeInvoice();
      // findFirst は contract チェック後、次に重複チェックで呼ばれる
      // contract チェックは leaseContract.findFirst、重複チェックは invoice.findFirst
      mockTxClient.invoice.findFirst.mockResolvedValue(existing);

      const result = await createInvoice(makeCtx(), {
        contractId: 100,
        periodStart: "2026-04-01",
        periodEnd: "2026-04-30",
        amount: 50000,
      });

      expect(result.created).toBe(false);
      expect(result.invoice.id).toBe(1);
      // AuditLog は呼ばれない
      expect(mockTxClient.auditLog.create).not.toHaveBeenCalled();
    });

    it("他テナントの契約への請求作成は拒否", async () => {
      mockTxClient.leaseContract.findFirst.mockResolvedValue(null);

      await expect(
        createInvoice(makeCtx(), {
          contractId: 999,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
          amount: 50000,
        }),
      ).rejects.toThrow("契約");
    });
  });

  describe("confirmInvoice", () => {
    it("draft → confirmed", async () => {
      const draft = makeInvoice({ status: "draft" });
      const confirmed = makeInvoice({ status: "confirmed", confirmedAt: now });
      mockTxClient.invoice.findFirst.mockResolvedValue(draft);
      mockTxClient.invoice.update.mockResolvedValue(confirmed);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await confirmInvoice(makeCtx(), 1);
      expect(result.status).toBe("confirmed");
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("冪等性: すでに confirmed → そのまま返す", async () => {
      const confirmed = makeInvoice({ status: "confirmed", confirmedAt: now });
      mockTxClient.invoice.findFirst.mockResolvedValue(confirmed);

      const result = await confirmInvoice(makeCtx(), 1);
      expect(result.status).toBe("confirmed");
      // update は呼ばれない
      expect(mockTxClient.invoice.update).not.toHaveBeenCalled();
    });

    it("cancelled → confirmed は禁止", async () => {
      const cancelled = makeInvoice({ status: "cancelled" });
      mockTxClient.invoice.findFirst.mockResolvedValue(cancelled);

      await expect(confirmInvoice(makeCtx(), 1)).rejects.toThrow("キャンセル済み");
    });

    it("存在しない請求は NotFound", async () => {
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      await expect(confirmInvoice(makeCtx(), 999)).rejects.toThrow("請求");
    });
  });

  describe("cancelInvoice", () => {
    it("draft → cancelled", async () => {
      const draft = makeInvoice({ status: "draft" });
      const cancelled = makeInvoice({
        status: "cancelled",
        cancelReason: "テスト",
        cancelledAt: now,
      });
      mockTxClient.invoice.findFirst.mockResolvedValue(draft);
      mockTxClient.invoice.update.mockResolvedValue(cancelled);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await cancelInvoice(makeCtx(), 1, { reason: "テスト" });
      expect(result.status).toBe("cancelled");
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("confirmed → cancelled も可能", async () => {
      const confirmed = makeInvoice({ status: "confirmed", confirmedAt: now });
      const cancelled = makeInvoice({
        status: "cancelled",
        cancelReason: "誤り",
        cancelledAt: now,
      });
      mockTxClient.invoice.findFirst.mockResolvedValue(confirmed);
      mockTxClient.invoice.update.mockResolvedValue(cancelled);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await cancelInvoice(makeCtx(), 1, { reason: "誤り" });
      expect(result.status).toBe("cancelled");
    });

    it("冪等性: すでに cancelled → そのまま返す", async () => {
      const cancelled = makeInvoice({ status: "cancelled" });
      mockTxClient.invoice.findFirst.mockResolvedValue(cancelled);

      const result = await cancelInvoice(makeCtx(), 1, { reason: "再キャンセル" });
      expect(result.status).toBe("cancelled");
      expect(mockTxClient.invoice.update).not.toHaveBeenCalled();
    });

    it("存在しない請求は NotFound", async () => {
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      await expect(
        cancelInvoice(makeCtx(), 999, { reason: "テスト" }),
      ).rejects.toThrow("請求");
    });
  });
});
