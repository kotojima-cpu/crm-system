/**
 * Tenant User feature 固有 AuditLog helper
 */

import { AUDIT_USER_INVITED } from "@/audit";
import type { WriteAuditLogInput } from "@/audit";
import type { TenantId } from "@/shared/types";
import type { InvitationRecord } from "./types";

/** 招待予約の監査ログ入力 */
export function buildTenantUserInviteRequestedAudit(
  invitation: InvitationRecord,
  tenantId: TenantId,
): WriteAuditLogInput {
  return {
    ...AUDIT_USER_INVITED,
    recordId: invitation.id,
    result: "success",
    requestedTenantId: tenantId,
    effectiveTenantId: tenantId,
    newValues: {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  };
}
