/**
 * テナント所有権検証
 *
 * 設計書: tenant-auth-design.md §5.7
 *
 * ID 指定操作（findUnique, update, delete, upsert）では
 * レコード取得後に必ず assertTenantOwnership を呼び出す。
 */

import type { TenantId, SessionUser } from "../types";
import { TenantOwnershipError, NotFoundError } from "../errors";

/**
 * レコードがセッションユーザーのテナントに属することを検証する。
 *
 * @param record - DB から取得したレコード（tenantId フィールドを持つ）
 * @param user - 認証済みユーザー
 * @throws NotFoundError レコードが null の場合
 * @throws TenantOwnershipError tenantId が不一致の場合
 */
export function assertTenantOwnership(
  record: { tenantId: number } | null,
  user: SessionUser,
): asserts record is { tenantId: number } {
  if (!record) {
    throw new NotFoundError();
  }
  if (user.tenantId !== null && record.tenantId !== (user.tenantId as number)) {
    throw new TenantOwnershipError();
  }
}
