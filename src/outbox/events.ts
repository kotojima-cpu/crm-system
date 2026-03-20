/**
 * Outbox イベント定数
 *
 * 文字列乱立を防ぐため、よく使うイベント種別を定数化する。
 * 利用側はスプレッド展開で WriteOutboxEventInput に合成する。
 *
 * @example
 *   await writeOutboxEvent(tx, {
 *     ...OUTBOX_INVOICE_CREATED,
 *     jobType: "invoice.created",
 *     resourceId: invoice.id,
 *     payload: { invoiceId: invoice.id, amount: invoice.totalAmount },
 *   });
 */

import type { OutboxEventType, OutboxExecutionMode } from "./types";

interface OutboxEventDef {
  readonly eventType: OutboxEventType;
  readonly executionMode: OutboxExecutionMode;
}

// --- 請求書系 ---

export const OUTBOX_INVOICE_CREATED: OutboxEventDef = {
  eventType: "invoice.created",
  executionMode: "queue",
} as const;

export const OUTBOX_INVOICE_CONFIRMED: OutboxEventDef = {
  eventType: "invoice.confirmed",
  executionMode: "queue",
} as const;

export const OUTBOX_INVOICE_CANCELLED: OutboxEventDef = {
  eventType: "invoice.cancelled",
  executionMode: "queue",
} as const;

// --- 顧客系 ---

export const OUTBOX_CUSTOMER_CREATED: OutboxEventDef = {
  eventType: "customer.created",
  executionMode: "queue",
} as const;

export const OUTBOX_CUSTOMER_UPDATED: OutboxEventDef = {
  eventType: "customer.updated",
  executionMode: "queue",
} as const;

export const OUTBOX_CUSTOMER_DELETED: OutboxEventDef = {
  eventType: "customer.deleted",
  executionMode: "queue",
} as const;

// --- 契約系 ---

export const OUTBOX_CONTRACT_CREATED: OutboxEventDef = {
  eventType: "contract.created",
  executionMode: "queue",
} as const;

export const OUTBOX_CONTRACT_UPDATED: OutboxEventDef = {
  eventType: "contract.updated",
  executionMode: "queue",
} as const;

// --- テナントユーザー系 ---

export const OUTBOX_TENANT_USER_INVITE_REQUESTED: OutboxEventDef = {
  eventType: "tenant-user.invite.requested",
  executionMode: "email",
} as const;

// --- テナント系 ---

export const OUTBOX_TENANT_SUSPENDED: OutboxEventDef = {
  eventType: "tenant.suspended",
  executionMode: "webhook",
} as const;

export const OUTBOX_TENANT_RESUMED: OutboxEventDef = {
  eventType: "tenant.resumed",
  executionMode: "webhook",
} as const;

// --- メール系 ---

export const OUTBOX_EMAIL_SEND: OutboxEventDef = {
  eventType: "email.send",
  executionMode: "email",
} as const;

export const OUTBOX_EMAIL_INVOICE_NOTIFICATION: OutboxEventDef = {
  eventType: "email.invoice_notification",
  executionMode: "email",
} as const;

// --- Webhook 系 ---

export const OUTBOX_WEBHOOK_DISPATCH: OutboxEventDef = {
  eventType: "webhook.dispatch",
  executionMode: "webhook",
} as const;

export type { OutboxEventDef };
