/**
 * Permission 定義と Role → Permission マッピング
 *
 * 業務機能の権限を enum 化し、ロールごとの許可を定義する。
 */

import type { UserRole } from "./types";

/** 業務機能の権限 */
export enum Permission {
  // 顧客管理
  CUSTOMER_READ = "CUSTOMER_READ",
  CUSTOMER_WRITE = "CUSTOMER_WRITE",

  // 契約管理
  CONTRACT_READ = "CONTRACT_READ",
  CONTRACT_WRITE = "CONTRACT_WRITE",

  // 請求管理
  INVOICE_READ = "INVOICE_READ",
  INVOICE_CREATE = "INVOICE_CREATE",
  INVOICE_CANCEL = "INVOICE_CANCEL",
  INVOICE_CONFIRM = "INVOICE_CONFIRM",

  // ユーザー管理
  USER_READ = "USER_READ",
  USER_WRITE = "USER_WRITE",

  // テナント管理（platform のみ）
  TENANT_READ = "TENANT_READ",
  TENANT_WRITE = "TENANT_WRITE",
  TENANT_SUSPEND = "TENANT_SUSPEND",

  // 監査ログ
  AUDIT_LOG_READ = "AUDIT_LOG_READ",

  // バッチ処理
  BATCH_EXECUTE = "BATCH_EXECUTE",

  // Outbox 運用（platform 専用）
  OUTBOX_READ = "OUTBOX_READ",
  OUTBOX_RETRY = "OUTBOX_RETRY",
  OUTBOX_REPLAY = "OUTBOX_REPLAY",
  OUTBOX_FORCE_REPLAY = "OUTBOX_FORCE_REPLAY",
  OUTBOX_POLL_EXECUTE = "OUTBOX_POLL_EXECUTE",
  OUTBOX_RECOVER_STUCK = "OUTBOX_RECOVER_STUCK",
  OUTBOX_HEALTH_CHECK = "OUTBOX_HEALTH_CHECK",

  // 監視・メトリクス
  MONITORING_READ = "MONITORING_READ",

  // 運営担当者管理（platform_master のみ）
  OPERATOR_MANAGE = "OPERATOR_MANAGE",

  // テナント削除（platform_master のみ）
  TENANT_DELETE = "TENANT_DELETE",
}

/**
 * platform_operator（親担当者）の権限
 *
 * テナント管理（作成・停止・契約者更新）+ 子管理者アカウント管理を許可する。
 * Outbox運用・親担当者管理・監査ログなど master 専用機能は持たない。
 */
const PLATFORM_OPERATOR_PERMISSIONS: Permission[] = [
  Permission.TENANT_READ,          // テナント一覧・詳細の閲覧
  Permission.TENANT_WRITE,         // テナント作成 + 契約者情報更新
  Permission.TENANT_SUSPEND,       // テナント停止 / 再開
];

/**
 * platform_master（親管理者）の全権限
 *
 * platform_operator の権限に加え、全運営機能を持つ。
 */
const PLATFORM_MASTER_PERMISSIONS: Permission[] = [
  // テナント管理
  Permission.TENANT_READ,
  Permission.TENANT_WRITE,
  Permission.TENANT_SUSPEND,
  Permission.TENANT_DELETE,
  // ユーザー管理
  Permission.USER_READ,
  Permission.USER_WRITE,
  // 運営担当者管理
  Permission.OPERATOR_MANAGE,
  // 顧客・契約・請求の閲覧（運用監視用）
  Permission.CUSTOMER_READ,
  Permission.CONTRACT_READ,
  Permission.INVOICE_READ,
  Permission.INVOICE_CREATE,
  Permission.INVOICE_CANCEL,
  Permission.INVOICE_CONFIRM,
  // 監査・バッチ
  Permission.AUDIT_LOG_READ,
  Permission.BATCH_EXECUTE,
  // Outbox 運用
  Permission.OUTBOX_READ,
  Permission.OUTBOX_RETRY,
  Permission.OUTBOX_REPLAY,
  Permission.OUTBOX_FORCE_REPLAY,
  Permission.OUTBOX_POLL_EXECUTE,
  Permission.OUTBOX_RECOVER_STUCK,
  Permission.OUTBOX_HEALTH_CHECK,
  // 監視
  Permission.MONITORING_READ,
];

/** ロールごとの権限マッピング */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  sales: new Set([
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_WRITE,
    Permission.CONTRACT_READ,
    Permission.CONTRACT_WRITE,
  ]),

  tenant_admin: new Set([
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_WRITE,
    Permission.CONTRACT_READ,
    Permission.CONTRACT_WRITE,
    Permission.INVOICE_READ,
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.AUDIT_LOG_READ,
  ]),

  platform_operator: new Set(PLATFORM_OPERATOR_PERMISSIONS),

  platform_master: new Set(PLATFORM_MASTER_PERMISSIONS),
};

/** ユーザーが指定の権限を持つか判定する */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** ユーザーが指定の権限を全て持つか判定する */
export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[],
): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  return permissions.every((p) => rolePerms.has(p));
}
