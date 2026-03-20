/**
 * platform-alerts audit テスト
 *
 * auditOutboxAlertSuppressed の仕様を検証する:
 * - withPlatformTx + writeAuditLog が呼ばれる
 * - 失敗しても throw しない（best-effort）
 * - 正しい newValues が渡される
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

const mockWriteAuditLog = vi.fn();
vi.mock("@/audit/writer", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  buildAuditLogInput: vi.fn(),
}));

vi.mock("@/audit/actions", () => ({
  AUDIT_OUTBOX_ALERT_SUPPRESSED: { action: "suppress", resourceType: "outbox_event" },
}));

const mockTx = {};
vi.mock("@/shared/db", () => ({
  withPlatformTx: vi.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
  withTenantTx: vi.fn(),
  withSystemTx: vi.fn(),
  prisma: {},
}));

import { auditOutboxAlertSuppressed } from "@/features/platform-alerts/audit";

describe("auditOutboxAlertSuppressed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writeAuditLog を呼ぶ", async () => {
    mockWriteAuditLog.mockResolvedValue(undefined);

    await auditOutboxAlertSuppressed({
      alertKey: "DEAD_EVENTS_EXIST",
      channels: ["webhook"],
      alertCodes: ["DEAD_EVENTS_EXIST"],
      environment: "staging",
    });

    expect(mockWriteAuditLog).toHaveBeenCalledOnce();
    const [, input] = mockWriteAuditLog.mock.calls[0];
    expect(input.action).toBe("suppress");
    expect(input.result).toBe("success");
    expect(input.newValues.reason).toBe("cooldown");
    expect(input.newValues.channels).toContain("webhook");
    expect(input.newValues.alertCodes).toContain("DEAD_EVENTS_EXIST");
    expect(input.newValues.environment).toBe("staging");
  });

  it("writeAuditLog が失敗しても throw しない（best-effort）", async () => {
    mockWriteAuditLog.mockRejectedValue(new Error("DB error"));

    await expect(
      auditOutboxAlertSuppressed({
        alertKey: "STUCK_PROCESSING",
        channels: ["mail"],
        alertCodes: ["STUCK_PROCESSING"],
        environment: "production",
      }),
    ).resolves.toBeUndefined();
  });

  it("複数チャネルが suppressed の場合も正しく記録する", async () => {
    mockWriteAuditLog.mockResolvedValue(undefined);

    await auditOutboxAlertSuppressed({
      alertKey: "DEAD_EVENTS_EXIST|STUCK_PROCESSING",
      channels: ["webhook", "mail"],
      alertCodes: ["DEAD_EVENTS_EXIST", "STUCK_PROCESSING"],
      environment: "production",
    });

    const [, input] = mockWriteAuditLog.mock.calls[0];
    expect(input.newValues.channels).toHaveLength(2);
    expect(input.newValues.alertCodes).toHaveLength(2);
  });
});
