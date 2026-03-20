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
  leaseContract: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  customer: {
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

const { validateCreateContractInput, validateUpdateContractInput } = await import(
  "@/features/contracts/validators"
);
const { listContracts, getContractById, createContract, updateContract } = await import(
  "@/features/contracts/service"
);
const { buildContractCreatedAudit, buildContractUpdatedAudit } = await import(
  "@/features/contracts/audit"
);
const { buildContractCreatedOutbox, buildContractUpdatedOutbox } = await import(
  "@/features/contracts/outbox"
);

import type { TenantId, ActorUserId } from "@/shared/types";

function makeCtx() {
  return {
    tenantId: 1 as TenantId,
    actorUserId: 10 as ActorUserId,
    actorRole: "tenant_admin",
  };
}

const now = new Date();

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: 1,
    customerId: 100,
    contractNumber: "C-001",
    productName: "複合機A",
    leaseCompanyName: "リース会社X",
    contractStartDate: now,
    contractEndDate: new Date(now.getTime() + 365 * 86400000),
    contractMonths: 12,
    monthlyFee: 50000,
    counterBaseFee: null,
    monoCounterRate: null,
    colorCounterRate: null,
    billingBaseDay: 25,
    contractStatus: "active",
    notes: null,
    createdBy: 10,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// --- Validator テスト ---

describe("Contract Validators", () => {
  describe("validateCreateContractInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateCreateContractInput({
        customerId: 1,
        productName: "複合機A",
        contractStartDate: "2026-04-01",
        contractEndDate: "2027-03-31",
        contractMonths: 12,
      });
      expect(result.customerId).toBe(1);
      expect(result.productName).toBe("複合機A");
      expect(result.contractMonths).toBe(12);
    });

    it("customerId 必須", () => {
      expect(() =>
        validateCreateContractInput({
          productName: "A",
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
        }),
      ).toThrow("顧客ID");
    });

    it("productName 必須", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
        }),
      ).toThrow("製品名");
    });

    it("productName 200文字超拒否", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          productName: "a".repeat(201),
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
        }),
      ).toThrow("200文字以内");
    });

    it("contractStartDate 必須", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          productName: "A",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
        }),
      ).toThrow("契約開始日");
    });

    it("contractMonths 正の整数", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          productName: "A",
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 0,
        }),
      ).toThrow("契約月数");
    });

    it("monthlyFee 負数拒否", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          productName: "A",
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
          monthlyFee: -1,
        }),
      ).toThrow("月額");
    });

    it("billingBaseDay 1〜28 範囲外拒否", () => {
      expect(() =>
        validateCreateContractInput({
          customerId: 1,
          productName: "A",
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
          billingBaseDay: 29,
        }),
      ).toThrow("請求基準日");
    });
  });

  describe("validateUpdateContractInput", () => {
    it("部分更新を受け付ける", () => {
      const result = validateUpdateContractInput({ monthlyFee: 60000 });
      expect(result.monthlyFee).toBe(60000);
      expect(result.productName).toBeUndefined();
    });

    it("productName 空文字拒否", () => {
      expect(() => validateUpdateContractInput({ productName: "" })).toThrow(
        "製品名",
      );
    });

    it("不正な contractStatus 拒否", () => {
      expect(() =>
        validateUpdateContractInput({ contractStatus: "invalid" }),
      ).toThrow("ステータス");
    });

    it("有効な contractStatus を受け付ける", () => {
      const result = validateUpdateContractInput({ contractStatus: "expired" });
      expect(result.contractStatus).toBe("expired");
    });
  });
});

// --- Audit helper テスト ---

describe("Contract Audit Helpers", () => {
  it("buildContractCreatedAudit — action/resourceType が正しい", () => {
    const contract = makeContract();
    const audit = buildContractCreatedAudit(contract, 1 as TenantId);
    expect(audit.action).toBe("create");
    expect(audit.resourceType).toBe("contract");
    expect(audit.recordId).toBe(1);
    expect(audit.result).toBe("success");
    expect(audit.newValues).toHaveProperty("productName", "複合機A");
  });

  it("buildContractUpdatedAudit — old/new values が正しい", () => {
    const existing = makeContract({ monthlyFee: 50000 });
    const updated = makeContract({ monthlyFee: 60000 });
    const input = { monthlyFee: 60000 };

    const audit = buildContractUpdatedAudit(existing, updated, input, 1 as TenantId);
    expect(audit.action).toBe("update");
    expect(audit.oldValues).toEqual({ monthlyFee: 50000 });
    expect(audit.newValues).toEqual({ monthlyFee: 60000 });
  });
});

// --- Outbox helper テスト ---

describe("Contract Outbox Helpers", () => {
  it("buildContractCreatedOutbox — eventType が正しい", () => {
    const contract = makeContract();
    const outbox = buildContractCreatedOutbox(contract, 1 as TenantId);
    expect(outbox.eventType).toBe("contract.created");
    expect(outbox.resourceId).toBe(1);
    expect(outbox.payload).toHaveProperty("productName", "複合機A");
  });

  it("buildContractUpdatedOutbox — eventType が正しい", () => {
    const contract = makeContract({ id: 2 });
    const outbox = buildContractUpdatedOutbox(contract, 1 as TenantId);
    expect(outbox.eventType).toBe("contract.updated");
    expect(outbox.resourceId).toBe(2);
  });
});

// --- Service テスト ---

describe("Contract Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listContracts", () => {
    it("tenant スコープで一覧取得", async () => {
      const contracts = [
        {
          id: 1, customerId: 100, contractNumber: "C-001",
          productName: "複合機A", contractStartDate: now,
          contractEndDate: now, contractStatus: "active", monthlyFee: 50000,
        },
      ];
      mockTxClient.leaseContract.findMany.mockResolvedValue(contracts);
      mockTxClient.leaseContract.count.mockResolvedValue(1);

      const result = await listContracts(makeCtx(), {
        tenantId: 1 as TenantId,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      const whereArg = mockTxClient.leaseContract.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });
  });

  describe("getContractById", () => {
    it("tenant スコープで単一取得", async () => {
      const contract = makeContract();
      mockTxClient.leaseContract.findFirst.mockResolvedValue(contract);

      const result = await getContractById(makeCtx(), 1);
      expect(result.productName).toBe("複合機A");

      const whereArg = mockTxClient.leaseContract.findFirst.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });

    it("存在しない契約は NotFound", async () => {
      mockTxClient.leaseContract.findFirst.mockResolvedValue(null);
      await expect(getContractById(makeCtx(), 999)).rejects.toThrow("契約");
    });
  });

  describe("createContract", () => {
    it("契約作成 + AuditLog + Outbox が呼ばれる", async () => {
      mockTxClient.customer.findFirst.mockResolvedValue({ id: 100, tenantId: 1 });
      const created = makeContract();
      mockTxClient.leaseContract.create.mockResolvedValue(created);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await createContract(makeCtx(), {
        customerId: 100,
        productName: "複合機A",
        contractStartDate: "2026-04-01",
        contractEndDate: "2027-03-31",
        contractMonths: 12,
      });

      expect(result.productName).toBe("複合機A");
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();

      const createData = mockTxClient.leaseContract.create.mock.calls[0][0].data;
      expect(createData.tenantId).toBe(1);
    });

    it("他テナントの顧客への契約作成は拒否", async () => {
      mockTxClient.customer.findFirst.mockResolvedValue(null);

      await expect(
        createContract(makeCtx(), {
          customerId: 999,
          productName: "A",
          contractStartDate: "2026-04-01",
          contractEndDate: "2027-03-31",
          contractMonths: 12,
        }),
      ).rejects.toThrow("顧客");
    });
  });

  describe("updateContract", () => {
    it("契約更新 + 監査ログ", async () => {
      const existing = makeContract({ monthlyFee: 50000 });
      const updated = makeContract({ monthlyFee: 60000 });
      mockTxClient.leaseContract.findFirst.mockResolvedValue(existing);
      mockTxClient.leaseContract.update.mockResolvedValue(updated);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await updateContract(makeCtx(), 1, { monthlyFee: 60000 });
      expect(result.monthlyFee).toBe(60000);
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("存在しない契約の更新は NotFound", async () => {
      mockTxClient.leaseContract.findFirst.mockResolvedValue(null);
      await expect(
        updateContract(makeCtx(), 999, { monthlyFee: 60000 }),
      ).rejects.toThrow("契約");
    });
  });
});
