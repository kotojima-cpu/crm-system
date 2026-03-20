import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-003",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
    actorRole: "platform_admin",
  }),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-003",
    executionContext: "platform",
    tenantId: null,
    actorUserId: 1,
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
  tenant: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
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
}));

const { validateTenantIdParam, validateSuspendTenantInput } = await import(
  "@/features/platform-tenants/validators"
);
const { listTenants, suspendTenant } = await import(
  "@/features/platform-tenants/service"
);
const { buildTenantSuspendedAudit } = await import(
  "@/features/platform-tenants/audit"
);
const { buildTenantSuspendedOutbox } = await import(
  "@/features/platform-tenants/outbox"
);

import type { TenantId, ActorUserId } from "@/shared/types";

function makeCtx() {
  return {
    actorUserId: 1 as ActorUserId,
    actorRole: "platform_admin",
  };
}

// --- Validator テスト ---

describe("Platform Tenant Validators", () => {
  describe("validateTenantIdParam", () => {
    it("正の整数を受け付ける", () => {
      const result = validateTenantIdParam("1");
      expect(result).toBe(1);
    });

    it("不正な値を拒否", () => {
      expect(() => validateTenantIdParam("abc")).toThrow("テナントIDが不正です");
    });

    it("負の値を拒否", () => {
      expect(() => validateTenantIdParam("-1")).toThrow("テナントIDが不正です");
    });

    it("0 を拒否", () => {
      expect(() => validateTenantIdParam("0")).toThrow("テナントIDが不正です");
    });
  });

  describe("validateSuspendTenantInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateSuspendTenantInput({ reason: "規約違反" });
      expect(result.reason).toBe("規約違反");
    });

    it("reason 必須", () => {
      expect(() => validateSuspendTenantInput({})).toThrow("停止理由は必須です");
    });

    it("reason 空文字拒否", () => {
      expect(() => validateSuspendTenantInput({ reason: "  " })).toThrow(
        "停止理由は必須です",
      );
    });

    it("reason 1000文字超拒否", () => {
      expect(() =>
        validateSuspendTenantInput({ reason: "a".repeat(1001) }),
      ).toThrow("1000文字以内");
    });
  });
});

// --- Audit helper テスト ---

describe("Platform Tenant Audit Helpers", () => {
  it("buildTenantSuspendedAudit — action/resourceType が正しい", () => {
    const tenant = {
      id: 1, name: "テスト社", status: "suspended",
      createdAt: new Date(), updatedAt: new Date(),
    };
    const audit = buildTenantSuspendedAudit(
      tenant, { reason: "規約違反" }, 1 as TenantId,
    );
    expect(audit.action).toBe("suspend");
    expect(audit.resourceType).toBe("tenant");
    expect(audit.recordId).toBe(1);
    expect(audit.targetTenantId).toBe(1);
    expect(audit.oldValues).toEqual({ status: "active" });
    expect(audit.newValues).toEqual({ status: "suspended", reason: "規約違反" });
  });
});

// --- Outbox helper テスト ---

describe("Platform Tenant Outbox Helpers", () => {
  it("buildTenantSuspendedOutbox — eventType が正しい", () => {
    const tenant = {
      id: 1, name: "テスト社", status: "suspended",
      createdAt: new Date(), updatedAt: new Date(),
    };
    const outbox = buildTenantSuspendedOutbox(
      tenant, { reason: "規約違反" }, 1 as TenantId,
    );
    expect(outbox.eventType).toBe("tenant.suspended");
    expect(outbox.executionMode).toBe("webhook");
    expect(outbox.payload.tenantName).toBe("テスト社");
    expect(outbox.payload.reason).toBe("規約違反");
  });
});

// --- Service テスト ---

describe("Platform Tenant Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTenants", () => {
    it("テナント一覧取得", async () => {
      const tenants = [
        { id: 1, name: "テスト社A", status: "active", createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: "テスト社B", status: "active", createdAt: new Date(), updatedAt: new Date() },
      ];
      mockTxClient.tenant.findMany.mockResolvedValue(tenants);
      mockTxClient.tenant.count.mockResolvedValue(2);

      const result = await listTenants(makeCtx(), { page: 1, limit: 20 });
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe("suspendTenant", () => {
    it("停止予約で AuditLog + Outbox が作られる", async () => {
      const tenant = {
        id: 1, name: "テスト社", status: "active",
        createdAt: new Date(), updatedAt: new Date(),
      };
      const suspended = { ...tenant, status: "suspended" };
      mockTxClient.tenant.findUnique.mockResolvedValue(tenant);
      mockTxClient.tenant.update.mockResolvedValue(suspended);
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await suspendTenant(
        makeCtx(),
        1 as TenantId,
        { reason: "規約違反" },
      );

      expect(result.status).toBe("suspended");

      // AuditLog 必須
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("存在しないテナントの停止は NotFound", async () => {
      mockTxClient.tenant.findUnique.mockResolvedValue(null);

      await expect(
        suspendTenant(makeCtx(), 999 as TenantId, { reason: "テスト" }),
      ).rejects.toThrow("テナント");
    });

    it("すでに停止済みの場合は冪等（再停止しない）", async () => {
      const alreadySuspended = {
        id: 1, name: "テスト社", status: "suspended",
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockTxClient.tenant.findUnique.mockResolvedValue(alreadySuspended);

      const result = await suspendTenant(
        makeCtx(),
        1 as TenantId,
        { reason: "再停止テスト" },
      );

      expect(result.status).toBe("suspended");
      // update は呼ばれない（冪等）
      expect(mockTxClient.tenant.update).not.toHaveBeenCalled();
      // AuditLog も呼ばれない（状態変更なし）
      expect(mockTxClient.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
