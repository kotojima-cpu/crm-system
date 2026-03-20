/**
 * セッション取得処理
 *
 * NextAuth.js セッションから SessionUser を取得する。
 * 設計書: tenant-auth-design.md §8.1
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SessionUser } from "@/shared/types";
import { toActorUserId, toTenantId } from "@/shared/types/helpers";
import { UnauthorizedError } from "@/shared/errors";

/**
 * セッションからユーザーを取得する。
 * 未ログインなら null を返す。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  return {
    id: toActorUserId(Number(session.user.id)),
    name: session.user.name,
    loginId: session.user.loginId,
    role: session.user.role as SessionUser["role"],
    tenantId: session.user.tenantId
      ? toTenantId(Number(session.user.tenantId))
      : null,
    tenantStatus: session.user.tenantStatus ?? null,
    authVersion: Number(session.user.authVersion ?? 1),
  };
}

/**
 * セッションからユーザーを取得する（必須版）。
 * 未ログインなら UnauthorizedError を投げる。
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}
