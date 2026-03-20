/**
 * 認証・認可 型定義
 *
 * SessionUser は shared/types/index.ts で定義済み。
 * ここではロール・権限のマッピング型を定義する。
 */

/**
 * ユーザーロール
 *
 * 設計整合性メモ（修正D）:
 *   - "platform_admin" — SaaS 運営者。全テナント管理、テナント CRUD、課金管理
 *   - "tenant_admin"   — テナント管理者。自テナント内のユーザー・設定管理
 *   - "sales"          — テナント一般業務ユーザー。顧客・契約の CRUD が主務
 *
 * "sales" は現行スキーマの role カラム（"admin" | "sales"）と同一値を維持する。
 * マルチテナント移行時に "admin" → "tenant_admin" へ変換する。
 * DB カラムでの値と UserRole 型の値は 1:1 対応とする。
 */
export type UserRole = "platform_admin" | "tenant_admin" | "sales";

/** ロール判定ヘルパー */
export function isTenantRole(role: string): role is "tenant_admin" | "sales" {
  return role === "tenant_admin" || role === "sales";
}

export function isPlatformRole(role: string): role is "platform_admin" {
  return role === "platform_admin";
}
