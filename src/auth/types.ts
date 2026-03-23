/**
 * 認証・認可 型定義
 */

/**
 * ユーザーロール
 *
 * - "platform_master"   — SaaS 最上位運営者。担当者管理、テナント削除、セキュリティ設定
 * - "platform_operator" — 親担当者。子管理者アカウントの作成・停止のみ
 * - "tenant_admin"      — テナント管理者。自テナント内のユーザー・設定管理
 * - "sales"             — テナント一般業務ユーザー。顧客・契約の CRUD が主務
 */
export type UserRole = "platform_master" | "platform_operator" | "tenant_admin" | "sales";

/** プラットフォームロール（master / operator の両方） */
export type PlatformRole = "platform_master" | "platform_operator";

/** ロール判定ヘルパー */
export function isTenantRole(role: string): role is "tenant_admin" | "sales" {
  return role === "tenant_admin" || role === "sales";
}

/** platform_admin は旧ロール名。JWT 移行期間中の互換対応として含める。全 JWT 更新後に削除すること。 */
export function isPlatformRole(role: string): role is PlatformRole {
  return role === "platform_master" || role === "platform_operator" || role === "platform_admin";
}

export function isPlatformMaster(role: string): role is "platform_master" {
  return role === "platform_master";
}
