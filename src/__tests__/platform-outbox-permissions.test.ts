/**
 * Platform Outbox Permission テスト
 *
 * - 6 個の新規 permission が enum に定義されていること
 * - platform_admin が全 outbox permission を持つこと
 * - tenant_admin / sales が outbox permission を持たないこと
 * - hasPermission / hasAllPermissions の動作
 */

import { describe, it, expect } from "vitest";
import { Permission, hasPermission, hasAllPermissions } from "@/auth/permissions";

const OUTBOX_PERMISSIONS = [
  Permission.OUTBOX_READ,
  Permission.OUTBOX_RETRY,
  Permission.OUTBOX_REPLAY,
  Permission.OUTBOX_FORCE_REPLAY,
  Permission.OUTBOX_POLL_EXECUTE,
  Permission.MONITORING_READ,
] as const;

describe("Permission enum — Outbox 運用権限", () => {
  it.each(OUTBOX_PERMISSIONS)("%s が enum に定義されている", (permission) => {
    expect(permission).toBeDefined();
    expect(typeof permission).toBe("string");
  });

  it("OUTBOX_READ が正しい文字列値を持つ", () => {
    expect(Permission.OUTBOX_READ).toBe("OUTBOX_READ");
  });

  it("OUTBOX_FORCE_REPLAY が正しい文字列値を持つ", () => {
    expect(Permission.OUTBOX_FORCE_REPLAY).toBe("OUTBOX_FORCE_REPLAY");
  });

  it("MONITORING_READ が正しい文字列値を持つ", () => {
    expect(Permission.MONITORING_READ).toBe("MONITORING_READ");
  });
});

describe("platform_admin の Outbox 権限", () => {
  it.each(OUTBOX_PERMISSIONS)(
    "platform_admin は %s を持つ",
    (permission) => {
      expect(hasPermission("platform_admin", permission)).toBe(true);
    },
  );

  it("platform_admin は全 Outbox 権限を一括で持つ", () => {
    expect(hasAllPermissions("platform_admin", [...OUTBOX_PERMISSIONS])).toBe(true);
  });
});

describe("tenant_admin の Outbox 権限", () => {
  it.each(OUTBOX_PERMISSIONS)(
    "tenant_admin は %s を持たない",
    (permission) => {
      expect(hasPermission("tenant_admin", permission)).toBe(false);
    },
  );
});

describe("sales の Outbox 権限", () => {
  it.each(OUTBOX_PERMISSIONS)(
    "sales は %s を持たない",
    (permission) => {
      expect(hasPermission("sales", permission)).toBe(false);
    },
  );
});

describe("Outbox permission の粒度分離", () => {
  it("OUTBOX_READ と OUTBOX_RETRY は別 permission である", () => {
    expect(Permission.OUTBOX_READ).not.toBe(Permission.OUTBOX_RETRY);
  });

  it("OUTBOX_REPLAY と OUTBOX_FORCE_REPLAY は別 permission である", () => {
    expect(Permission.OUTBOX_REPLAY).not.toBe(Permission.OUTBOX_FORCE_REPLAY);
  });

  it("OUTBOX_POLL_EXECUTE と BATCH_EXECUTE は別 permission である", () => {
    expect(Permission.OUTBOX_POLL_EXECUTE).not.toBe(Permission.BATCH_EXECUTE);
  });
});
