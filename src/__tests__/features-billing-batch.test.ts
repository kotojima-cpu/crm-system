import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => ({
    requestId: "req-batch-001",
    executionContext: "system",
    tenantId: null,
    actorUserId: 99,
    actorRole: "platform_admin",
  }),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => ({
    requestId: "req-batch-001",
    executionContext: "system",
    tenantId: null,
    actorUserId: 99,
    actorRole: "platform_admin",
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
  leaseContract: {
    findMany: vi.fn(),
  },
  invoice: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  tenant: {
    findMany: vi.fn(),
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

const {
  validateTargetMonth,
  validateGenerateMonthlyInvoicesInput,
} = await import("@/features/billing-batch/validators");
const {
  generateMonthlyInvoicesForTenant,
  generateMonthlyInvoicesForAllTenants,
} = await import("@/features/billing-batch/service");
const { buildMonthlyInvoiceCreatedAudit } = await import(
  "@/features/billing-batch/audit"
);
const { buildMonthlyInvoiceCreatedOutbox } = await import(
  "@/features/billing-batch/outbox"
);

import type { TenantId, ActorUserId } from "@/shared/types";

function makeCtx() {
  return {
    tenantId: 1 as TenantId,
    actorUserId: 99 as ActorUserId,
    actorRole: "platform_admin",
  };
}

const periodStart = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
const periodEnd = new Date(Date.UTC(2026, 3, 30));  // 2026-04-30

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 1,
    customerId: 100,
    productName: "複合機A",
    contractStartDate: new Date("2026-01-01"),
    contractEndDate: new Date("2027-12-31"),
    monthlyFee: 50000,
    billingBaseDay: 25,
    contractStatus: "active",
    ...overrides,
  };
}

// --- Validator テスト ---

describe("Billing Batch Validators", () => {
  describe("validateTargetMonth", () => {
    it("正常な YYYY-MM を受け付ける", () => {
      expect(validateTargetMonth("2026-04")).toBe("2026-04");
      expect(validateTargetMonth("2026-12")).toBe("2026-12");
    });

    it("不正な形式を拒否する", () => {
      expect(() => validateTargetMonth("2026-4")).toThrow("YYYY-MM");
      expect(() => validateTargetMonth("2026-13")).toThrow("YYYY-MM");
      expect(() => validateTargetMonth("abcd-01")).toThrow("YYYY-MM");
      expect(() => validateTargetMonth("")).toThrow("YYYY-MM");
    });
  });

  describe("validateGenerateMonthlyInvoicesInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateGenerateMonthlyInvoicesInput({
        targetMonth: "2026-04",
        tenantId: 1,
        dryRun: true,
      });
      expect(result.targetMonth).toBe("2026-04");
      expect(result.tenantId).toBe(1);
      expect(result.dryRun).toBe(true);
    });

    it("targetMonth 必須", () => {
      expect(() => validateGenerateMonthlyInvoicesInput({})).toThrow(
        "targetMonth",
      );
    });

    it("tenantId 省略可", () => {
      const result = validateGenerateMonthlyInvoicesInput({
        targetMonth: "2026-04",
      });
      expect(result.tenantId).toBeNull();
    });

    it("tenantId 0以下は拒否", () => {
      expect(() =>
        validateGenerateMonthlyInvoicesInput({
          targetMonth: "2026-04",
          tenantId: 0,
        }),
      ).toThrow("正の整数");
    });
  });
});

// --- Audit helper テスト ---

describe("Billing Batch Audit Helpers", () => {
  it("buildMonthlyInvoiceCreatedAudit — source: monthly_batch", () => {
    const invoice = {
      id: 10,
      contractId: 1,
      customerId: 100,
      amount: 50000,
      periodStart,
      periodEnd,
    };
    const audit = buildMonthlyInvoiceCreatedAudit(
      invoice,
      "2026-04",
      1 as TenantId,
    );
    expect(audit.action).toBe("create");
    expect(audit.resourceType).toBe("invoice");
    expect(audit.recordId).toBe(10);
    expect(audit.newValues).toHaveProperty("source", "monthly_batch");
    expect(audit.newValues).toHaveProperty("targetMonth", "2026-04");
  });
});

// --- Outbox helper テスト ---

describe("Billing Batch Outbox Helpers", () => {
  it("buildMonthlyInvoiceCreatedOutbox — eventType と payload", () => {
    const invoice = {
      id: 10,
      contractId: 1,
      customerId: 100,
      amount: 50000,
      periodStart,
      periodEnd,
    };
    const outbox = buildMonthlyInvoiceCreatedOutbox(
      invoice,
      "2026-04",
      1 as TenantId,
    );
    expect(outbox.eventType).toBe("invoice.created");
    expect(outbox.resourceId).toBe(10);
    expect(outbox.payload).toHaveProperty("source", "monthly_batch");
    expect(outbox.payload).toHaveProperty("targetMonth", "2026-04");
  });
});

// --- Service テスト ---

describe("Billing Batch Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateMonthlyInvoicesForTenant", () => {
    it("対象契約から invoice を作成できる", async () => {
      const contract = makeContract();
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);
      mockTxClient.invoice.findFirst.mockResolvedValue(null); // 既存なし
      mockTxClient.invoice.create.mockResolvedValue({
        id: 10,
        tenantId: 1,
        contractId: 1,
        customerId: 100,
        periodStart,
        periodEnd,
        amount: 50000,
        status: "draft",
        createdBy: 99,
      });
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
      });

      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.summaries[0].created).toBe(true);
      expect(result.summaries[0].invoiceId).toBe(10);
    });

    it("既存 invoice がある場合は created: false", async () => {
      const contract = makeContract();
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);
      mockTxClient.invoice.findFirst.mockResolvedValue({
        id: 5,
        status: "draft",
      });

      const result = await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
      });

      expect(result.createdCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.summaries[0].created).toBe(false);
      expect(result.summaries[0].skippedReason).toBe("existing_invoice");
    });

    it("dryRun では DB 作成しない", async () => {
      const contract = makeContract();
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);
      mockTxClient.invoice.findFirst.mockResolvedValue(null);

      const result = await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
        dryRun: true,
      });

      expect(result.createdCount).toBe(1);
      expect(mockTxClient.invoice.create).not.toHaveBeenCalled();
      expect(mockTxClient.auditLog.create).not.toHaveBeenCalled();
    });

    it("monthlyFee がない契約はスキップ", async () => {
      const contract = makeContract({ monthlyFee: null });
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);

      const result = await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
      });

      expect(result.skippedCount).toBe(1);
      expect(result.summaries[0].skippedReason).toBe("contract_not_billable");
    });

    it("monthlyFee が 0 の契約はスキップ", async () => {
      const contract = makeContract({ monthlyFee: 0 });
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);

      const result = await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
      });

      expect(result.skippedCount).toBe(1);
      expect(result.summaries[0].skippedReason).toBe("contract_not_billable");
    });

    it("AuditLog が作成される", async () => {
      const contract = makeContract();
      mockTxClient.leaseContract.findMany.mockResolvedValue([contract]);
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      mockTxClient.invoice.create.mockResolvedValue({
        id: 10, tenantId: 1, contractId: 1, customerId: 100,
        periodStart, periodEnd, amount: 50000, status: "draft", createdBy: 99,
      });
      mockTxClient.auditLog.create.mockResolvedValue({});

      await generateMonthlyInvoicesForTenant(makeCtx(), {
        targetMonth: "2026-04",
        tenantId: 1,
      });

      expect(mockTxClient.auditLog.create).toHaveBeenCalled();
    });
  });

  describe("generateMonthlyInvoicesForAllTenants", () => {
    it("tenant ごとに分離して処理される", async () => {
      mockTxClient.tenant.findMany.mockResolvedValue([
        { id: 1, name: "Tenant A" },
        { id: 2, name: "Tenant B" },
      ]);

      // tenant 1: 1契約
      // tenant 2: 0契約
      let callCount = 0;
      mockTxClient.leaseContract.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([makeContract({ id: 1, tenantId: 1 })]);
        }
        return Promise.resolve([]);
      });
      mockTxClient.invoice.findFirst.mockResolvedValue(null);
      mockTxClient.invoice.create.mockResolvedValue({
        id: 10, tenantId: 1, contractId: 1, customerId: 100,
        periodStart, periodEnd, amount: 50000, status: "draft", createdBy: 99,
      });
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await generateMonthlyInvoicesForAllTenants(
        { tenantId: null as unknown as TenantId, actorUserId: 99 as ActorUserId, actorRole: "platform_admin" },
        { targetMonth: "2026-04" },
      );

      expect(result.totalTenants).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });
  });
});
