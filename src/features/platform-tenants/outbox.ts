/**
 * Platform Tenant feature 固有 Outbox helper
 */

import { OUTBOX_TENANT_SUSPENDED } from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type { TenantDetail, SuspendTenantInput } from "./types";

/** テナント停止の outbox イベント入力 */
export function buildTenantSuspendedOutbox(
  tenant: TenantDetail,
  input: SuspendTenantInput,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_TENANT_SUSPENDED,
    targetTenantId: tenantId,
    jobType: "tenant.suspended",
    resourceId: tenant.id,
    payload: {
      tenantId: tenant.id,
      tenantName: tenant.name,
      reason: input.reason,
      suspendedAt: new Date().toISOString(),
    },
  };
}
