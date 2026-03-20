/**
 * Customer feature 固有 AuditLog helper
 *
 * action/resourceType を定数から取り、old/new values の整形を helper 側へ寄せる。
 */

import {
  AUDIT_CUSTOMER_CREATED,
  AUDIT_CUSTOMER_UPDATED,
} from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { CustomerDetail, CreateCustomerInput, UpdateCustomerInput } from "./types";

/** 顧客作成の監査ログ入力 */
export function buildCustomerCreatedAudit(
  customer: CustomerDetail,
  _input: CreateCustomerInput,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_CUSTOMER_CREATED,
    recordId: customer.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      companyName: customer.companyName,
      companyNameKana: customer.companyNameKana,
      address: customer.address,
      phone: customer.phone,
      contactName: customer.contactName,
    },
  };
}

/** 顧客更新の監査ログ入力 */
export function buildCustomerUpdatedAudit(
  existing: CustomerDetail,
  updated: CustomerDetail,
  input: UpdateCustomerInput,
  tenantId: TenantId,
): WriteAuditLogInput {
  // old values: 変更対象のフィールドのみ抽出
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(input) as (keyof UpdateCustomerInput)[]) {
    if (input[key] !== undefined) {
      oldValues[key] = existing[key as keyof CustomerDetail];
      newValues[key] = updated[key as keyof CustomerDetail];
    }
  }

  return {
    ...AUDIT_CUSTOMER_UPDATED,
    recordId: existing.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    oldValues,
    newValues,
  };
}
