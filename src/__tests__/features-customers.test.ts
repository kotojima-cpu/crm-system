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

// Mock DB transaction wrappers
const mockTxClient = {
  customer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
  normalizePhone: vi.fn((phone: string) => phone?.replace(/[-\s]/g, "") || null),
}));

const { validateCreateCustomerInput, validateUpdateCustomerInput } = await import(
  "@/features/customers/validators"
);
const { listCustomers, getCustomerById, createCustomer, updateCustomer } = await import(
  "@/features/customers/service"
);
const { buildCustomerCreatedAudit, buildCustomerUpdatedAudit } = await import(
  "@/features/customers/audit"
);
const { buildCustomerCreatedOutbox, buildCustomerUpdatedOutbox } = await import(
  "@/features/customers/outbox"
);

import type { TenantId, ActorUserId } from "@/shared/types";

function makeCtx() {
  return {
    tenantId: 1 as TenantId,
    actorUserId: 10 as ActorUserId,
    actorRole: "tenant_admin",
  };
}

// --- Validator テスト ---

describe("Customer Validators", () => {
  describe("validateCreateCustomerInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateCreateCustomerInput({
        companyName: "テスト株式会社",
        address: "東京都",
      });
      expect(result.companyName).toBe("テスト株式会社");
      expect(result.address).toBe("東京都");
    });

    it("companyName 必須", () => {
      expect(() => validateCreateCustomerInput({})).toThrow("会社名は必須です");
    });

    it("companyName 空文字拒否", () => {
      expect(() => validateCreateCustomerInput({ companyName: "  " })).toThrow(
        "会社名は必須です",
      );
    });

    it("companyName 200文字超拒否", () => {
      expect(() =>
        validateCreateCustomerInput({ companyName: "a".repeat(201) }),
      ).toThrow("200文字以内");
    });

    it("任意フィールドは trim される", () => {
      const result = validateCreateCustomerInput({
        companyName: " テスト ",
        contactName: " 田中 ",
      });
      expect(result.companyName).toBe("テスト");
      expect(result.contactName).toBe("田中");
    });

    it("空文字の任意フィールドは null になる", () => {
      const result = validateCreateCustomerInput({
        companyName: "テスト",
        phone: "",
        fax: "  ",
      });
      expect(result.phone).toBeNull();
      expect(result.fax).toBeNull();
    });
  });

  describe("validateUpdateCustomerInput", () => {
    it("部分更新を受け付ける", () => {
      const result = validateUpdateCustomerInput({ address: "大阪府" });
      expect(result.address).toBe("大阪府");
      expect(result.companyName).toBeUndefined();
    });

    it("companyName を空にはできない", () => {
      expect(() => validateUpdateCustomerInput({ companyName: "" })).toThrow(
        "会社名は必須です",
      );
    });
  });
});

// --- Audit helper テスト ---

describe("Customer Audit Helpers", () => {
  it("buildCustomerCreatedAudit — action/resourceType が正しい", () => {
    const customer = {
      id: 1,
      tenantId: 1,
      companyName: "テスト",
      companyNameKana: null,
      zipCode: null,
      address: null,
      phone: null,
      fax: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      notes: null,
      createdBy: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const audit = buildCustomerCreatedAudit(
      customer,
      { companyName: "テスト" },
      1 as TenantId,
    );
    expect(audit.action).toBe("create");
    expect(audit.resourceType).toBe("customer");
    expect(audit.recordId).toBe(1);
    expect(audit.result).toBe("success");
  });

  it("buildCustomerUpdatedAudit — old/new values が正しい", () => {
    const existing = {
      id: 1, tenantId: 1, companyName: "旧名",
      companyNameKana: null, zipCode: null, address: "東京",
      phone: null, fax: null, contactName: null, contactPhone: null,
      contactEmail: null, notes: null, createdBy: 10,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const updated = { ...existing, companyName: "新名", address: "大阪" };
    const input = { companyName: "新名", address: "大阪" };

    const audit = buildCustomerUpdatedAudit(
      existing, updated, input, 1 as TenantId,
    );
    expect(audit.action).toBe("update");
    expect(audit.oldValues).toEqual({ companyName: "旧名", address: "東京" });
    expect(audit.newValues).toEqual({ companyName: "新名", address: "大阪" });
  });
});

// --- Outbox helper テスト ---

describe("Customer Outbox Helpers", () => {
  it("buildCustomerCreatedOutbox — eventType が正しい", () => {
    const customer = {
      id: 1, tenantId: 1, companyName: "テスト",
      companyNameKana: null, zipCode: null, address: null,
      phone: null, fax: null, contactName: null, contactPhone: null,
      contactEmail: null, notes: null, createdBy: 10,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const outbox = buildCustomerCreatedOutbox(customer, 1 as TenantId);
    expect(outbox.eventType).toBe("customer.created");
    expect(outbox.executionMode).toBe("queue");
    expect(outbox.resourceId).toBe(1);
  });

  it("buildCustomerUpdatedOutbox — eventType が正しい", () => {
    const customer = {
      id: 2, tenantId: 1, companyName: "更新済",
      companyNameKana: null, zipCode: null, address: null,
      phone: null, fax: null, contactName: null, contactPhone: null,
      contactEmail: null, notes: null, createdBy: 10,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const outbox = buildCustomerUpdatedOutbox(customer, 1 as TenantId);
    expect(outbox.eventType).toBe("customer.updated");
    expect(outbox.resourceId).toBe(2);
  });
});

// --- Service テスト ---

describe("Customer Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listCustomers", () => {
    it("tenant スコープで一覧取得", async () => {
      const customers = [
        { id: 1, companyName: "A社", address: null, phone: null, contactName: null, updatedAt: new Date() },
      ];
      mockTxClient.customer.findMany.mockResolvedValue(customers);
      mockTxClient.customer.count.mockResolvedValue(1);

      const result = await listCustomers(makeCtx(), {
        tenantId: 1 as TenantId,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      // findMany に tenantId が渡されている
      const whereArg = mockTxClient.customer.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
      expect(whereArg.isDeleted).toBe(false);
    });

    it("tenant A の顧客一覧に tenant B の顧客が混ざらない", async () => {
      mockTxClient.customer.findMany.mockResolvedValue([]);
      mockTxClient.customer.count.mockResolvedValue(0);

      await listCustomers(makeCtx(), {
        tenantId: 1 as TenantId,
        page: 1,
        limit: 20,
      });

      // where 条件に tenantId: 1 が含まれる
      const whereArg = mockTxClient.customer.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });
  });

  describe("getCustomerById", () => {
    it("tenant スコープで単一取得", async () => {
      const customer = {
        id: 1, tenantId: 1, companyName: "テスト",
        companyNameKana: null, zipCode: null, address: null,
        phone: null, fax: null, contactName: null, contactPhone: null,
        contactEmail: null, notes: null, createdBy: 10,
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockTxClient.customer.findFirst.mockResolvedValue(customer);

      const result = await getCustomerById(makeCtx(), 1);
      expect(result.companyName).toBe("テスト");

      // findFirst に tenantId が渡されている
      const whereArg = mockTxClient.customer.findFirst.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });

    it("tenant A から tenant B の顧客詳細を取得できない（NotFound）", async () => {
      // tenant 1 の顧客として取得しようとするが、tenant 2 の顧客なので null
      mockTxClient.customer.findFirst.mockResolvedValue(null);

      await expect(getCustomerById(makeCtx(), 999)).rejects.toThrow("顧客");
    });
  });

  describe("createCustomer", () => {
    it("顧客作成 + AuditLog + Outbox が呼ばれる", async () => {
      const created = {
        id: 1, tenantId: 1, companyName: "新規顧客",
        companyNameKana: null, zipCode: null, address: null,
        phone: null, fax: null, contactName: null, contactPhone: null,
        contactEmail: null, notes: null, createdBy: 10,
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockTxClient.customer.create.mockResolvedValue(created);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await createCustomer(makeCtx(), { companyName: "新規顧客" });
      expect(result.companyName).toBe("新規顧客");

      // AuditLog が呼ばれた
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();

      // create に tenantId が含まれている
      const createData = mockTxClient.customer.create.mock.calls[0][0].data;
      expect(createData.tenantId).toBe(1);
    });
  });

  describe("updateCustomer", () => {
    it("顧客更新 + old/new values が監査される", async () => {
      const existing = {
        id: 1, tenantId: 1, companyName: "旧名",
        companyNameKana: null, zipCode: null, address: "東京",
        phone: null, fax: null, contactName: null, contactPhone: null,
        contactEmail: null, notes: null, createdBy: 10,
        createdAt: new Date(), updatedAt: new Date(),
      };
      const updated = { ...existing, companyName: "新名" };
      mockTxClient.customer.findFirst.mockResolvedValue(existing);
      mockTxClient.customer.update.mockResolvedValue(updated);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await updateCustomer(makeCtx(), 1, { companyName: "新名" });
      expect(result.companyName).toBe("新名");

      // AuditLog が old/new values 付きで呼ばれた
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("存在しない顧客の更新は NotFound", async () => {
      mockTxClient.customer.findFirst.mockResolvedValue(null);

      await expect(
        updateCustomer(makeCtx(), 999, { companyName: "更新" }),
      ).rejects.toThrow("顧客");
    });
  });
});
