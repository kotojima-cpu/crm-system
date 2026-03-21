/**
 * テナントアクセス確認
 *
 * 設計書: tenant-auth-design.md §5.4
 *
 * テナントユーザーの認可チェック。
 * DB 再確認で authVersion / isActive / tenant.status を検証する。
 */

import { prisma } from "@/shared/db";
import type { SessionUser } from "@/shared/types";
import {
  SessionExpiredError,
  // TODO: マルチテナントスキーマ移行後に使用
  // TenantSuspendedError,
  ForbiddenError,
} from "@/shared/errors";
import { isTenantRole } from "./types";
import { requireSessionUser } from "./session";
import { logger } from "@/shared/logging";

/**
 * テナントアクセスを検証し、SessionUser を返す。
 *
 * チェック項目:
 * 1. ログイン済み
 * 2. テナントロール（tenant_admin or sales）
 * 3. tenantId が存在
 * 4. DB 再確認: isActive, authVersion, tenant.status
 */
export async function requireTenantAccess(): Promise<SessionUser> {
  const user = await requireSessionUser();

  // プラットフォーム管理者がテナント側 API を直接叩くことを禁止
  if (!isTenantRole(user.role)) {
    throw new ForbiddenError(
      "プラットフォーム管理者は /platform/* API を使用してください",
      "USE_PLATFORM_API",
    );
  }

  // テナント所属確認
  if (!user.tenantId) {
    throw new ForbiddenError("テナントに所属していません");
  }

  // DB 再確認（isActive）
  //
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ REQUIRED AFTER MULTI-TENANT SCHEMA MIGRATION                      │
  // │                                                                    │
  // │ 復帰条件:                                                          │
  // │   1. User モデルに authVersion: Int フィールドが追加されていること │
  // │   2. User モデルに tenant リレーション(tenantId)が追加されていること│
  // │   3. Tenant モデルに status フィールドが追加されていること          │
  // │                                                                    │
  // │ 復帰時の実装:                                                      │
  // │   select: {                                                        │
  // │     authVersion: true,                                             │
  // │     isActive: true,                                                │
  // │     tenant: { select: { status: true } }                           │
  // │   }                                                                │
  // │                                                                    │
  // │ authVersion チェック（修正B）:                                      │
  // │   if (dbUser.authVersion !== user.authVersion) {                   │
  // │     logger.warn("authVersion mismatch", {                         │
  // │       userId: user.id,                                             │
  // │       jwtVersion: user.authVersion,                                │
  // │       dbVersion: dbUser.authVersion,                               │
  // │     });                                                            │
  // │     throw new SessionExpiredError();                                │
  // │   }                                                                │
  // │                                                                    │
  // │ tenant.status チェック（修正C）:                                    │
  // │   if (dbUser.tenant?.status !== "active") {                        │
  // │     logger.warn("Tenant suspended", {                              │
  // │       userId: user.id,                                             │
  // │       tenantId: user.tenantId,                                     │
  // │       tenantStatus: dbUser.tenant?.status,                         │
  // │     });                                                            │
  // │     throw new TenantSuspendedError();                              │
  // │   }                                                                │
  // │                                                                    │
  // │ 設計書参照: security-design.md §5.2, tenant-auth-design.md §5.4   │
  // └─────────────────────────────────────────────────────────────────────┘
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id as number },
    select: {
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    logger.warn("Session invalidated: user inactive or not found", {
      userId: user.id,
    });
    throw new SessionExpiredError();
  }

  return user;
}

/**
 * テナント管理者権限を検証する。
 * requireTenantAccess + tenant_admin ロールチェック。
 */
export async function requireTenantAdmin(): Promise<SessionUser> {
  const user = await requireTenantAccess();

  if (user.role !== "tenant_admin") {
    throw new ForbiddenError("tenant_admin 権限が必要です");
  }

  return user;
}
