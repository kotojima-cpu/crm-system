/**
 * Platform Tenant feature 固有 AuditLog helper
 */

import { AUDIT_TENANT_SUSPENDED } from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { TenantDetail, SuspendTenantInput } from "./types";

/** テナント停止の監査ログ入力 */
export function buildTenantSuspendedAudit(
  tenant: TenantDetail,
  input: SuspendTenantInput,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_TENANT_SUSPENDED,
    recordId: tenant.id,
    targetTenantId: tenantId,
    result: "success",
    message: `Tenant "${tenant.name}" suspended: ${input.reason}`,
    oldValues: { status: "active" },
    newValues: { status: "suspended", reason: input.reason },
  };
}
