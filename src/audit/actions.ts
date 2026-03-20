/**
 * AuditLog 定数定義
 *
 * action / resource の文字列乱立を防ぐための定数。
 * 利用側は文字列リテラルではなくこの定数を使用すること。
 */

import type { AuditAction, AuditResourceType } from "./types";

// --- よく使う Action + Resource の組み合わせ定数 ---

interface AuditEventDef {
  readonly action: AuditAction;
  readonly resourceType: AuditResourceType;
}

/** 顧客系 */
export const AUDIT_CUSTOMER_CREATED: AuditEventDef = {
  action: "create",
  resourceType: "customer",
} as const;

export const AUDIT_CUSTOMER_UPDATED: AuditEventDef = {
  action: "update",
  resourceType: "customer",
} as const;

export const AUDIT_CUSTOMER_DELETED: AuditEventDef = {
  action: "delete",
  resourceType: "customer",
} as const;

/** 契約系 */
export const AUDIT_CONTRACT_CREATED: AuditEventDef = {
  action: "create",
  resourceType: "contract",
} as const;

export const AUDIT_CONTRACT_UPDATED: AuditEventDef = {
  action: "update",
  resourceType: "contract",
} as const;

export const AUDIT_CONTRACT_DELETED: AuditEventDef = {
  action: "delete",
  resourceType: "contract",
} as const;

/** 請求書系 */
export const AUDIT_INVOICE_CREATED: AuditEventDef = {
  action: "create",
  resourceType: "invoice",
} as const;

export const AUDIT_INVOICE_CONFIRMED: AuditEventDef = {
  action: "confirm",
  resourceType: "invoice",
} as const;

export const AUDIT_INVOICE_CANCELLED: AuditEventDef = {
  action: "cancel",
  resourceType: "invoice",
} as const;

/** ユーザー系 */
export const AUDIT_USER_CREATED: AuditEventDef = {
  action: "create",
  resourceType: "user",
} as const;

export const AUDIT_USER_UPDATED: AuditEventDef = {
  action: "update",
  resourceType: "user",
} as const;

export const AUDIT_USER_INVITED: AuditEventDef = {
  action: "invite",
  resourceType: "user",
} as const;

/** テナント系 */
export const AUDIT_TENANT_CREATED: AuditEventDef = {
  action: "create",
  resourceType: "tenant",
} as const;

export const AUDIT_TENANT_SUSPENDED: AuditEventDef = {
  action: "suspend",
  resourceType: "tenant",
} as const;

export const AUDIT_TENANT_RESUMED: AuditEventDef = {
  action: "resume",
  resourceType: "tenant",
} as const;

/** 認証系 */
export const AUDIT_AUTH_LOGIN: AuditEventDef = {
  action: "login",
  resourceType: "auth",
} as const;

export const AUDIT_AUTH_LOGOUT: AuditEventDef = {
  action: "logout",
  resourceType: "auth",
} as const;

/** Outbox 運用系 */
export const AUDIT_OUTBOX_RETRIED: AuditEventDef = {
  action: "retry",
  resourceType: "outbox_event",
} as const;

export const AUDIT_OUTBOX_REPLAYED: AuditEventDef = {
  action: "replay",
  resourceType: "outbox_event",
} as const;

export const AUDIT_OUTBOX_FORCE_REPLAYED: AuditEventDef = {
  action: "replay",
  resourceType: "outbox_event",
} as const;

export const AUDIT_OUTBOX_POLL_TRIGGERED: AuditEventDef = {
  action: "poll",
  resourceType: "outbox_event",
} as const;

export const AUDIT_OUTBOX_STUCK_RECOVERED: AuditEventDef = { action: "recover", resourceType: "outbox_event" };
export const AUDIT_OUTBOX_HEALTH_CHECK_TRIGGERED: AuditEventDef = { action: "poll", resourceType: "outbox_event" };
export const AUDIT_OUTBOX_ALERT_SUPPRESSED: AuditEventDef = { action: "suppress", resourceType: "outbox_event" };

export type { AuditEventDef };
