/**
 * API Guard — 認可 + RequestContext 統合
 *
 * API ルートの入口で使用する。
 * 認可チェック + RequestContext 設定 + Permission 検証を一括で行う。
 *
 * 使い方:
 *   const { user, runInContext } = await requireTenantPermission(Permission.CUSTOMER_READ, request);
 *   return runInContext(async () => { ... });
 */

import type { NextRequest } from "next/server";
import type { SessionUser, RequestContext, ExecutionContext, TenantId } from "@/shared/types";
import { createRequestContextFromHeaders, runWithRequestContext } from "@/shared/context";
import { ForbiddenError, TenantContextMismatchError } from "@/shared/errors";
import { Permission, hasPermission } from "./permissions";
import { requireTenantAccess, requireTenantAdmin } from "./tenant-access";
import { requirePlatformAccess } from "./platform-access";
import type { UserRole } from "./types";
import { logger } from "@/shared/logging";

/**
 * テナント系ガードのオプション。
 *
 * expectedTenantId — URL パラメータ等から取得したテナント ID。
 *   指定された場合、JWT の tenantId と突合し、不一致なら即拒否する。
 *   これにより「自テナント以外のリソースを URL 書き換えで操作する」攻撃を
 *   ガードレベルで防止する。
 */
export interface TenantGuardOptions {
  expectedTenantId?: TenantId;
}

interface GuardResult {
  user: SessionUser;
  /** RequestContext を設定して処理を実行するラッパー */
  runInContext: <T>(fn: () => Promise<T>) => Promise<T>;
}

function buildGuardResult(
  user: SessionUser,
  request: NextRequest,
  executionContext: ExecutionContext,
): GuardResult {
  const ctx: RequestContext = createRequestContextFromHeaders(
    request.headers,
    {
      executionContext,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorRole: user.role,
    },
  );

  return {
    user,
    runInContext: <T>(fn: () => Promise<T>) =>
      runWithRequestContext(ctx, fn),
  };
}

/**
 * テナント境界チェック。
 *
 * expectedTenantId が指定されている場合、JWT の tenantId と突合する。
 * 不一致は「テナント境界違反」として即拒否する。
 *
 * 目的: URL パラメータ改ざんによる他テナントリソースアクセスをガードレベルで防止。
 * （assertTenantOwnership はレコード単位の第2防衛線。本チェックは第1防衛線。）
 */
function assertTenantBoundary(
  user: SessionUser,
  options?: TenantGuardOptions,
): void {
  if (!options?.expectedTenantId) return;

  if (user.tenantId !== options.expectedTenantId) {
    logger.warn("Tenant boundary violation detected", {
      userId: user.id,
      jwtTenantId: user.tenantId,
      expectedTenantId: options.expectedTenantId,
    });
    throw new TenantContextMismatchError(
      options.expectedTenantId as number,
      user.tenantId as number | undefined,
    );
  }
}

/**
 * テナント権限ガード。
 *
 * 実行順序:
 * 1. requireTenantAccess（認証 + DB 再確認）
 * 2. テナント境界チェック（expectedTenantId 指定時）
 * 3. Permission チェック
 * 4. RequestContext 設定
 */
export async function requireTenantPermission(
  permission: Permission,
  request: NextRequest,
  options?: TenantGuardOptions,
): Promise<GuardResult> {
  const user = await requireTenantAccess();
  assertTenantBoundary(user, options);

  if (!hasPermission(user.role as UserRole, permission)) {
    throw new ForbiddenError("この操作の権限がありません");
  }

  return buildGuardResult(user, request, "tenant");
}

/**
 * テナント管理者権限ガード。
 *
 * requireTenantAdmin + テナント境界チェック + Permission チェック。
 */
export async function requireTenantAdminPermission(
  permission: Permission,
  request: NextRequest,
  options?: TenantGuardOptions,
): Promise<GuardResult> {
  const user = await requireTenantAdmin();
  assertTenantBoundary(user, options);

  if (!hasPermission(user.role as UserRole, permission)) {
    throw new ForbiddenError("この操作の権限がありません");
  }

  return buildGuardResult(user, request, "tenant");
}

/**
 * platform 権限ガード。
 *
 * 実行順序:
 * 1. requirePlatformAccess（認証 + DB 再確認）
 * 2. Permission チェック
 * 3. RequestContext 設定
 */
export async function requirePlatformPermission(
  permission: Permission,
  request: NextRequest,
): Promise<GuardResult> {
  const user = await requirePlatformAccess();

  if (!hasPermission(user.role as UserRole, permission)) {
    throw new ForbiddenError("この操作の権限がありません");
  }

  return buildGuardResult(user, request, "platform");
}
