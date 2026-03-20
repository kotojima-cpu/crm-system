/**
 * platform アクセス確認
 *
 * 設計書: tenant-auth-design.md §5.4
 *
 * platform_admin 専用の認可チェック。
 * DB 再確認で authVersion / isActive を検証する。
 */

import { prisma } from "@/shared/db";
import type { SessionUser } from "@/shared/types";
import { SessionExpiredError, ForbiddenError } from "@/shared/errors";
import { isPlatformRole } from "./types";
import { requireSessionUser } from "./session";
import { logger } from "@/shared/logging";

/**
 * platform_admin アクセスを検証し、SessionUser を返す。
 *
 * チェック項目:
 * 1. ログイン済み
 * 2. platform_admin ロール
 * 3. DB 再確認: isActive, authVersion
 */
export async function requirePlatformAccess(): Promise<SessionUser> {
  const user = await requireSessionUser();

  if (!isPlatformRole(user.role)) {
    throw new ForbiddenError("platform_admin 権限が必要です");
  }

  // DB 再確認（isActive）
  //
  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ REQUIRED AFTER MULTI-TENANT SCHEMA MIGRATION                      │
  // │                                                                    │
  // │ 復帰条件:                                                          │
  // │   1. User モデルに authVersion: Int フィールドが追加されていること │
  // │                                                                    │
  // │ 復帰時の実装:                                                      │
  // │   select: { authVersion: true, isActive: true }                    │
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
  // │ ※ platform_admin は tenant.status チェック不要                     │
  // │                                                                    │
  // │ 設計書参照: security-design.md §5.2                                │
  // └─────────────────────────────────────────────────────────────────────┘
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id as number },
    select: { isActive: true },
  });

  if (!dbUser || !dbUser.isActive) {
    logger.warn("Session invalidated: user inactive or not found", {
      userId: user.id,
    });
    throw new SessionExpiredError();
  }

  return user;
}
