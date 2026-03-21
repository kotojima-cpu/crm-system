/**
 * 認証・認可 型定義
 */

/**
 * ユーザーロール
 *
 * - "platform_master"   — SaaS 最上位運営者。担当者管理、テナント削除、セキュリティ設定
 * - "platform_operator" — SaaS 運営担当者。テナント管理、Outbox 運用、監視
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

export function isPlatformRole(role: string): role is PlatformRole {
  return role === "platform_master" || role === "platform_operator";
}

export function isPlatformMaster(role: string): role is "platform_master" {
  return role === "platform_master";
}
