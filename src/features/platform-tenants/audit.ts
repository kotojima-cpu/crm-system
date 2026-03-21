/**
 * Platform Tenant feature 固有 AuditLog helper
 */

import { AUDIT_TENANT_CREATED, AUDIT_TENANT_SUSPENDED, AUDIT_TENANT_RESUMED } from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { TenantDetail, CreateTenantInput, SuspendTenantInput, ResumeTenantInput } from "./types";

/** テナント作成の監査ログ入力 */
export function buildTenantCreatedAudit(
  tenant: TenantDetail,
  input: CreateTenantInput,
): WriteAuditLogInput {
  return {
    ...AUDIT_TENANT_CREATED,
    recordId: tenant.id,
    targetTenantId: tenant.id as unknown as TenantId,
    result: "success",
    message: `Tenant "${tenant.name}" created with admin "${input.adminLoginId}"`,
    newValues: {
      name: tenant.name,
      adminLoginId: input.adminLoginId,
      adminName: input.adminName,
    },
  };
}

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

/** テナント再開の監査ログ入力 */
export function buildTenantResumedAudit(
  tenant: TenantDetail,
  input: ResumeTenantInput,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_TENANT_RESUMED,
    recordId: tenant.id,
    targetTenantId: tenantId,
    result: "success",
    message: `Tenant "${tenant.name}" resumed: ${input.reason}`,
    oldValues: { status: "suspended" },
    newValues: { status: "active", reason: input.reason },
  };
}
