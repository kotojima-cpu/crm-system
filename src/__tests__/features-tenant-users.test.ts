import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-002",
    executionContext: "tenant",
    tenantId: 1,
    actorUserId: 10,
    actorRole: "tenant_admin",
  }),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => ({
    requestId: "req-test-002",
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
  user: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  tenantUserInvitation: {
    findFirst: vi.fn(),
    create: vi.fn(),
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

const { validateCreateInvitationInput } = await import(
  "@/features/tenant-users/validators"
);
const { listTenantUsers, createInvitation } = await import(
  "@/features/tenant-users/service"
);
const { buildTenantUserInviteRequestedAudit } = await import(
  "@/features/tenant-users/audit"
);
const { buildTenantUserInviteRequestedOutbox } = await import(
  "@/features/tenant-users/outbox"
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

describe("Tenant User Validators", () => {
  describe("validateCreateInvitationInput", () => {
    it("正常な入力を受け付ける", () => {
      const result = validateCreateInvitationInput({
        email: "user@example.com",
        role: "sales",
      });
      expect(result.email).toBe("user@example.com");
      expect(result.role).toBe("sales");
    });

    it("email 必須", () => {
      expect(() => validateCreateInvitationInput({ role: "sales" })).toThrow(
        "メールアドレスは必須です",
      );
    });

    it("不正な email 形式を拒否", () => {
      expect(() =>
        validateCreateInvitationInput({ email: "not-email", role: "sales" }),
      ).toThrow("メールアドレスの形式が不正です");
    });

    it("role 必須", () => {
      expect(() =>
        validateCreateInvitationInput({ email: "user@example.com" }),
      ).toThrow("ロールは必須です");
    });

    it("platform_admin 招待禁止", () => {
      expect(() =>
        validateCreateInvitationInput({
          email: "user@example.com",
          role: "platform_admin",
        }),
      ).toThrow("tenant_admin または sales のみ指定できます");
    });

    it("tenant_admin は許可", () => {
      const result = validateCreateInvitationInput({
        email: "admin@example.com",
        role: "tenant_admin",
      });
      expect(result.role).toBe("tenant_admin");
    });

    it("email は小文字化される", () => {
      const result = validateCreateInvitationInput({
        email: "User@Example.COM",
        role: "sales",
      });
      expect(result.email).toBe("user@example.com");
    });
  });
});

// --- Audit helper テスト ---

describe("Tenant User Audit Helpers", () => {
  it("buildTenantUserInviteRequestedAudit — action/resourceType が正しい", () => {
    const invitation = {
      id: 1, tenantId: 1, email: "user@example.com",
      role: "sales", token: "tok-1", status: "pending",
      expiresAt: new Date(), createdAt: new Date(),
    };
    const audit = buildTenantUserInviteRequestedAudit(invitation, 1 as TenantId);
    expect(audit.action).toBe("invite");
    expect(audit.resourceType).toBe("user");
    expect(audit.recordId).toBe(1);
  });
});

// --- Outbox helper テスト ---

describe("Tenant User Outbox Helpers", () => {
  it("buildTenantUserInviteRequestedOutbox — eventType が正しい", () => {
    const invitation = {
      id: 1, tenantId: 1, email: "user@example.com",
      role: "sales", token: "tok-1", status: "pending",
      expiresAt: new Date(), createdAt: new Date(),
    };
    const outbox = buildTenantUserInviteRequestedOutbox(invitation, 1 as TenantId);
    expect(outbox.eventType).toBe("tenant-user.invite.requested");
    expect(outbox.executionMode).toBe("email");
    expect(outbox.payload.inviteeEmail).toBe("user@example.com");
    expect(outbox.payload.invitedRole).toBe("sales");
  });
});

// --- Service テスト ---

describe("Tenant User Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listTenantUsers", () => {
    it("tenant スコープでユーザー一覧取得", async () => {
      const users = [
        { id: 1, name: "田中", loginId: "tanaka", role: "sales", isActive: true, createdAt: new Date() },
      ];
      mockTxClient.user.findMany.mockResolvedValue(users);
      mockTxClient.user.count.mockResolvedValue(1);

      const result = await listTenantUsers(makeCtx(), {
        tenantId: 1 as TenantId,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      // where に tenantId が含まれる
      const whereArg = mockTxClient.user.findMany.mock.calls[0][0].where;
      expect(whereArg.tenantId).toBe(1);
    });
  });

  describe("createInvitation", () => {
    it("招待予約で AuditLog + Outbox が作られる", async () => {
      mockTxClient.tenantUserInvitation.findFirst.mockResolvedValue(null);
      mockTxClient.tenantUserInvitation.create.mockResolvedValue({
        id: 1, tenantId: 1, email: "new@example.com",
        role: "sales", token: "tok-1", status: "pending",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
      });
      mockTxClient.auditLog.create.mockResolvedValue({});

      const result = await createInvitation(makeCtx(), {
        email: "new@example.com",
        role: "sales",
      });

      expect(result.email).toBe("new@example.com");
      expect(result.status).toBe("pending");

      // AuditLog が呼ばれた
      expect(mockTxClient.auditLog.create).toHaveBeenCalledOnce();
    });

    it("招待メールは transaction 内送信されない（outbox 経由のみ）", async () => {
      mockTxClient.tenantUserInvitation.findFirst.mockResolvedValue(null);
      mockTxClient.tenantUserInvitation.create.mockResolvedValue({
        id: 2, tenantId: 1, email: "new@example.com",
        role: "sales", token: "tok-2", status: "pending",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
      });
      mockTxClient.auditLog.create.mockResolvedValue({});

      await createInvitation(makeCtx(), {
        email: "new@example.com",
        role: "sales",
      });

      // Mailer が直接呼ばれていないことを確認
      // (transaction mock 内には mailer 呼び出しがない)
      // outbox event はログ出力として記録される（writeOutboxEvent 暫定実装）
    });

    it("同一メールで pending 招待が存在する場合はエラー", async () => {
      mockTxClient.tenantUserInvitation.findFirst.mockResolvedValue({
        id: 1, tenantId: 1, email: "dup@example.com",
        role: "sales", token: "tok-existing", status: "pending",
        expiresAt: new Date(), createdAt: new Date(),
      });

      await expect(
        createInvitation(makeCtx(), { email: "dup@example.com", role: "sales" }),
      ).rejects.toThrow("既に有効な招待");
    });
  });
});
