/**
 * Customer feature 固有 Outbox helper
 *
 * outbox envelope の tenant 文脈を必ず埋め、requestId を含める。
 */

import {
  OUTBOX_CUSTOMER_CREATED,
  OUTBOX_CUSTOMER_UPDATED,
} from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type { CustomerDetail } from "./types";

/** 顧客作成の outbox イベント入力 */
export function buildCustomerCreatedOutbox(
  customer: CustomerDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_CUSTOMER_CREATED,
    tenantId,
    jobType: "customer.created",
    resourceId: customer.id,
    payload: {
      customerId: customer.id,
      companyName: customer.companyName,
    },
  };
}

/** 顧客更新の outbox イベント入力 */
export function buildCustomerUpdatedOutbox(
  customer: CustomerDetail,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_CUSTOMER_UPDATED,
    tenantId,
    jobType: "customer.updated",
    resourceId: customer.id,
    payload: {
      customerId: customer.id,
      companyName: customer.companyName,
    },
  };
}
