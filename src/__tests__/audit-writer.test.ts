import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WriteAuditLogInput } from "@/audit/types";
import type { RequestContext, RequestId, TenantId, ActorUserId } from "@/shared/types";

// モック用の状態をモジュールスコープで管理
let mockCtx: RequestContext | null = null;

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => mockCtx,
  requireRequestContext: () => {
    if (!mockCtx) throw new Error("RequestContext is not set");
    return mockCtx;
  },
  runWithRequestContext: vi.fn(),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/context", () => ({
  getRequestContext: () => mockCtx,
  requireRequestContext: () => {
    if (!mockCtx) throw new Error("RequestContext is not set");
    return mockCtx;
  },
  runWithRequestContext: vi.fn(),
  createRequestContextFromHeaders: vi.fn(),
  createRequestContextForWorker: vi.fn(),
}));

vi.mock("@/shared/logging", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// モック設定後にインポート
const { buildAuditLogInput, writeAuditLog } = await import("@/audit/writer");

function rid(s: string): RequestId {
  return s as RequestId;
}
function tid(n: number): TenantId {
  return n as TenantId;
}
function uid(n: number): ActorUserId {
  return n as ActorUserId;
}

const baseInput: WriteAuditLogInput = {
  resourceType: "customer",
  action: "create",
  result: "success",
};

const testContext: RequestContext = {
  requestId: rid("req-123"),
  executionContext: "tenant",
  tenantId: tid(1),
  actorUserId: uid(42),
  actorRole: "sales",
};

beforeEach(() => {
  mockCtx = null;
});

// ============================================================
// buildAuditLogInput — RequestContext あり
// ============================================================
describe("buildAuditLogInput — RequestContext あり", () => {
  it("RequestContext から requestId, actorUserId, actorRole, executionContext が補完される", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput(baseInput);

    expect(resolved.requestId).toBe("req-123");
    expect(resolved.actorUserId).toBe(42);
    expect(resolved.actorRole).toBe("sales");
    expect(resolved.executionContext).toBe("tenant");
  });

  it("RequestContext の tenantId が requestedTenantId / effectiveTenantId に使われる", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput(baseInput);

    expect(resolved.requestedTenantId).toBe(1);
    expect(resolved.effectiveTenantId).toBe(1);
  });

  it("明示的に渡した値は RequestContext より優先される", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput({
      ...baseInput,
      requestId: rid("explicit-req"),
      actorUserId: uid(99),
      actorRole: "tenant_admin",
      executionContext: "platform",
    });

    expect(resolved.requestId).toBe("explicit-req");
    expect(resolved.actorUserId).toBe(99);
    expect(resolved.actorRole).toBe("tenant_admin");
    expect(resolved.executionContext).toBe("platform");
  });

  it("recordId, message, metadata が反映される", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput({
      ...baseInput,
      recordId: 100,
      message: "顧客を作成しました",
      metadata: { source: "web" },
    });

    expect(resolved.recordId).toBe(100);
    expect(resolved.message).toBe("顧客を作成しました");
    expect(resolved.metadata).not.toBeNull();
    expect(JSON.parse(resolved.metadata!).source).toBe("web");
  });

  it("oldValues / newValues の機密キーがサニタイズされる", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput({
      ...baseInput,
      oldValues: { name: "旧名", passwordHash: "xxx" },
      newValues: { name: "新名", passwordHash: "yyy" },
    });

    const oldParsed = JSON.parse(resolved.oldValues!);
    const newParsed = JSON.parse(resolved.newValues!);
    expect(oldParsed.name).toBe("旧名");
    expect(oldParsed.passwordHash).toBe("[REDACTED]");
    expect(newParsed.name).toBe("新名");
    expect(newParsed.passwordHash).toBe("[REDACTED]");
  });
});

// ============================================================
// buildAuditLogInput — RequestContext なし
// ============================================================
describe("buildAuditLogInput — RequestContext なし", () => {
  it("requestId 未指定でエラーになる", () => {
    expect(() => buildAuditLogInput(baseInput)).toThrow("requestId is required");
  });

  it("executionContext 未指定でエラーになる", () => {
    expect(() =>
      buildAuditLogInput({
        ...baseInput,
        requestId: rid("req-1"),
      }),
    ).toThrow("executionContext is required");
  });

  it("actorRole 未指定でエラーになる", () => {
    expect(() =>
      buildAuditLogInput({
        ...baseInput,
        requestId: rid("req-1"),
        executionContext: "tenant",
      }),
    ).toThrow("actorRole is required");
  });

  it("全必須項目を明示すれば成功する", () => {
    const resolved = buildAuditLogInput({
      ...baseInput,
      requestId: rid("req-explicit"),
      executionContext: "system",
      actorRole: "system",
      actorUserId: null,
    });

    expect(resolved.requestId).toBe("req-explicit");
    expect(resolved.executionContext).toBe("system");
    expect(resolved.actorRole).toBe("system");
    expect(resolved.actorUserId).toBeNull();
  });
});

// ============================================================
// buildAuditLogInput — action/resource 定数の利用
// ============================================================
describe("buildAuditLogInput — action 定数", () => {
  it("AUDIT_CUSTOMER_CREATED のスプレッドで正しく設定される", () => {
    mockCtx = testContext;

    const resolved = buildAuditLogInput({
      action: "create",
      resourceType: "customer",
      result: "success",
      recordId: 1,
    });

    expect(resolved.action).toBe("create");
    expect(resolved.resourceType).toBe("customer");
  });
});

// ============================================================
// buildAuditLogInput — platform コンテキスト
// ============================================================
describe("buildAuditLogInput — platform コンテキスト", () => {
  it("platform コンテキストでは targetTenantId が effectiveTenantId になる", () => {
    mockCtx = {
      requestId: rid("req-plat"),
      executionContext: "platform",
      tenantId: null,
      actorUserId: uid(1),
      actorRole: "platform_admin",
    };

    const resolved = buildAuditLogInput({
      ...baseInput,
      targetTenantId: tid(5),
    });

    expect(resolved.effectiveTenantId).toBe(5);
    expect(resolved.targetTenantId).toBe(5);
    expect(resolved.requestedTenantId).toBeNull();
  });
});

// ============================================================
// writeAuditLog — DB 保存の envelope 構造検証
// ============================================================
describe("writeAuditLog — DB 保存 envelope 構造", () => {
  it("tx.auditLog.create に envelope 構造の newValues が渡される", async () => {
    mockCtx = testContext;

    const mockCreate = vi.fn().mockResolvedValue({ id: 1 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, {
      ...baseInput,
      recordId: 10,
      newValues: { companyName: "テスト株式会社" },
      message: "顧客を作成しました",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callData = mockCreate.mock.calls[0][0].data;

    // 基本フィールド
    expect(callData.userId).toBe(42);
    expect(callData.action).toBe("create");
    expect(callData.tableName).toBe("customer");
    expect(callData.recordId).toBe(10);

    // newValues は envelope 構造
    const envelope = JSON.parse(callData.newValues);
    expect(envelope).toHaveProperty("business");
    expect(envelope).toHaveProperty("auditMeta");

    // business に元の newValues が入っている
    expect(envelope.business.companyName).toBe("テスト株式会社");

    // auditMeta に監査拡張情報が入っている
    expect(envelope.auditMeta.requestId).toBe("req-123");
    expect(envelope.auditMeta.executionContext).toBe("tenant");
    expect(envelope.auditMeta.actorRole).toBe("sales");
    expect(envelope.auditMeta.result).toBe("success");
    expect(envelope.auditMeta.message).toBe("顧客を作成しました");
  });

  it("auditMeta に requestedTenantId / effectiveTenantId が含まれる（tenant コンテキスト）", async () => {
    mockCtx = testContext;

    const mockCreate = vi.fn().mockResolvedValue({ id: 2 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, baseInput);

    const envelope = JSON.parse(mockCreate.mock.calls[0][0].data.newValues);
    expect(envelope.auditMeta.requestedTenantId).toBe(1);
    expect(envelope.auditMeta.effectiveTenantId).toBe(1);
  });

  it("auditMeta に targetTenantId が含まれる（platform コンテキスト）", async () => {
    mockCtx = {
      requestId: rid("req-plat"),
      executionContext: "platform",
      tenantId: null,
      actorUserId: uid(1),
      actorRole: "platform_admin",
    };

    const mockCreate = vi.fn().mockResolvedValue({ id: 3 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, {
      action: "suspend",
      resourceType: "tenant",
      result: "success",
      targetTenantId: tid(5),
      recordId: 5,
      message: "Tenant suspended",
    });

    const envelope = JSON.parse(mockCreate.mock.calls[0][0].data.newValues);
    expect(envelope.auditMeta.targetTenantId).toBe(5);
    expect(envelope.auditMeta.effectiveTenantId).toBe(5);
    expect(envelope.auditMeta.result).toBe("success");
    expect(envelope.auditMeta.message).toBe("Tenant suspended");
  });

  it("newValues がない場合も envelope 構造で business: null が入る", async () => {
    mockCtx = testContext;

    const mockCreate = vi.fn().mockResolvedValue({ id: 4 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, baseInput);

    const envelope = JSON.parse(mockCreate.mock.calls[0][0].data.newValues);
    expect(envelope.business).toBeNull();
    expect(envelope.auditMeta.requestId).toBe("req-123");
  });

  it("oldValues は envelope 化されずそのまま保存される", async () => {
    mockCtx = testContext;

    const mockCreate = vi.fn().mockResolvedValue({ id: 5 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, {
      ...baseInput,
      oldValues: { status: "active" },
      newValues: { status: "expired" },
    });

    const callData = mockCreate.mock.calls[0][0].data;

    // oldValues はサニタイズ済みだが envelope ではない
    const oldParsed = JSON.parse(callData.oldValues);
    expect(oldParsed.status).toBe("active");
    expect(oldParsed).not.toHaveProperty("business");
    expect(oldParsed).not.toHaveProperty("auditMeta");

    // newValues は envelope
    const newParsed = JSON.parse(callData.newValues);
    expect(newParsed.business.status).toBe("expired");
    expect(newParsed.auditMeta).toBeDefined();
  });

  it("metadata が auditMeta 内に含まれる", async () => {
    mockCtx = testContext;

    const mockCreate = vi.fn().mockResolvedValue({ id: 6 });
    const mockTx = {
      auditLog: { create: mockCreate },
    } as unknown as Parameters<typeof writeAuditLog>[0];

    await writeAuditLog(mockTx, {
      ...baseInput,
      metadata: { source: "api", importBatch: 42 },
    });

    const envelope = JSON.parse(mockCreate.mock.calls[0][0].data.newValues);
    expect(envelope.auditMeta.metadata).toEqual({ source: "api", importBatch: 42 });
  });
});
