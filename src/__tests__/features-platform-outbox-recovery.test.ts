/**
 * platform-outbox-recovery テスト
 *
 * stuck event recovery の仕様を検証する:
 * - stuck 判定 (thresholdMinutes)
 * - dryRun モード (DB 更新なし)
 * - recovery 実行 (processing → failed)
 * - limit バリデーション
 * - threshold バリデーション
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));
vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));

// Prisma モック（hoisted で宣言して vi.mock factory から参照できるようにする）
const { mockOutboxEvent, mockAuditLog } = vi.hoisted(() => ({
  mockOutboxEvent: {
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  mockAuditLog: { create: vi.fn() },
}));

vi.mock("@/shared/db", () => ({
  prisma: { outboxEvent: mockOutboxEvent },
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ outboxEvent: mockOutboxEvent, auditLog: mockAuditLog }),
  ),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
}));

import { ValidationError } from "@/shared/errors";
import { validateRecoverStuckEventsInput } from "@/features/platform-outbox-recovery/validators";
import {
  recoverStuckOutboxEvents,
  listRecoverableStuckEvents,
  countRecoverableStuckOutboxEvents,
} from "@/features/platform-outbox-recovery/service";

function makeStuckEvent(id: number) {
  return {
    id,
    eventType: "invoice.created",
    executionMode: "queue",
    status: "processing",
    updatedAt: new Date("2026-03-31T23:30:00Z"), // 30分前 → stuck
    retryCount: 1,
    maxRetries: 3,
  };
}

// ────────────────────────────────────────────────────────────
// validators
// ────────────────────────────────────────────────────────────

describe("validateRecoverStuckEventsInput", () => {
  it("デフォルト値: threshold=15, limit=100, dryRun=false", () => {
    const result = validateRecoverStuckEventsInput({});
    expect(result.thresholdMinutes).toBe(15);
    expect(result.limit).toBe(100);
    expect(result.dryRun).toBe(false);
  });

  it("有効な入力を通す", () => {
    const result = validateRecoverStuckEventsInput({
      thresholdMinutes: 30,
      limit: 50,
      dryRun: true,
    });
    expect(result.thresholdMinutes).toBe(30);
    expect(result.limit).toBe(50);
    expect(result.dryRun).toBe(true);
  });

  it("thresholdMinutes < 1 → ValidationError", () => {
    expect(() => validateRecoverStuckEventsInput({ thresholdMinutes: 0 })).toThrow(
      ValidationError,
    );
  });

  it("thresholdMinutes > 1440 → ValidationError", () => {
    expect(() =>
      validateRecoverStuckEventsInput({ thresholdMinutes: 1441 }),
    ).toThrow(ValidationError);
  });

  it("limit < 1 → ValidationError", () => {
    expect(() => validateRecoverStuckEventsInput({ limit: 0 })).toThrow(
      ValidationError,
    );
  });

  it("limit > 500 → ValidationError", () => {
    expect(() => validateRecoverStuckEventsInput({ limit: 501 })).toThrow(
      ValidationError,
    );
  });

  it("limit = 500 (最大値) は有効", () => {
    const result = validateRecoverStuckEventsInput({ limit: 500 });
    expect(result.limit).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────
// dryRun モード
// ────────────────────────────────────────────────────────────

describe("recoverStuckOutboxEvents — dryRun=true", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DB 更新なし、対象 ID 一覧を返す", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeStuckEvent(1), makeStuckEvent(2)]);

    const result = await recoverStuckOutboxEvents({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.recoveredIds).toEqual([1, 2]);
    expect(result.scannedCount).toBe(2);
    expect(result.recoveredCount).toBe(0);
    // DB update は呼ばれない
    expect(mockOutboxEvent.update).not.toHaveBeenCalled();
  });

  it("対象なし → 0件返す", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([]);

    const result = await recoverStuckOutboxEvents({ dryRun: true });
    expect(result.scannedCount).toBe(0);
    expect(result.recoveredIds).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// recovery 実行
// ────────────────────────────────────────────────────────────

describe("recoverStuckOutboxEvents — 実行", () => {
  beforeEach(() => vi.clearAllMocks());

  it("処理中イベントを failed にリセットする", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeStuckEvent(10), makeStuckEvent(11)]);
    mockOutboxEvent.update.mockResolvedValue({});
    mockAuditLog.create.mockResolvedValue({});

    const result = await recoverStuckOutboxEvents({ dryRun: false });

    expect(result.dryRun).toBe(false);
    expect(result.recoveredCount).toBe(2);
    expect(result.recoveredIds).toEqual([10, 11]);
    expect(result.skippedCount).toBe(0);

    // update が recovery 件数分呼ばれる
    expect(mockOutboxEvent.update).toHaveBeenCalledTimes(2);

    // lastError に reason が入る
    const callArg = mockOutboxEvent.update.mock.calls[0][0].data;
    expect(callArg.status).toBe("failed");
    expect(callArg.lastError).toContain("Recovered from stuck processing");
  });

  it("1件更新失敗しても他の件は skip してカウントする", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeStuckEvent(20), makeStuckEvent(21)]);
    mockOutboxEvent.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("DB error"));

    const result = await recoverStuckOutboxEvents({ dryRun: false });
    expect(result.recoveredCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.recoveredIds).toContain(20);
    expect(result.skippedIds).toContain(21);
  });

  it("AuditLog は best-effort — 失敗しても recovery 結果に影響しない", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeStuckEvent(30)]);
    mockOutboxEvent.update.mockResolvedValue({});
    mockAuditLog.create.mockRejectedValue(new Error("audit error"));

    const result = await recoverStuckOutboxEvents({ dryRun: false });
    expect(result.recoveredCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// listRecoverableStuckEvents
// ────────────────────────────────────────────────────────────

describe("listRecoverableStuckEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("thresholdMinutes と limit を渡す", async () => {
    mockOutboxEvent.findMany.mockResolvedValue([makeStuckEvent(1)]);

    const result = await listRecoverableStuckEvents(30, 50);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);

    // threshold が WHERE に反映されている
    const where = mockOutboxEvent.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("processing");
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
  });
});

// ────────────────────────────────────────────────────────────
// countRecoverableStuckOutboxEvents
// ────────────────────────────────────────────────────────────

describe("countRecoverableStuckOutboxEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DB から count を返す", async () => {
    mockOutboxEvent.count.mockResolvedValue(5);
    const count = await countRecoverableStuckOutboxEvents(15);
    expect(count).toBe(5);
  });
});
