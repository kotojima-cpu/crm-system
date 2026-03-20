/**
 * Tenant User feature 固有 Outbox helper
 */

import { OUTBOX_TENANT_USER_INVITE_REQUESTED } from "@/outbox";
import type { WriteOutboxEventInput } from "@/outbox";
import type { TenantId } from "@/shared/types";
import type { InvitationRecord } from "./types";

/** 招待予約の outbox イベント入力 */
export function buildTenantUserInviteRequestedOutbox(
  invitation: InvitationRecord,
  tenantId: TenantId,
): WriteOutboxEventInput {
  return {
    ...OUTBOX_TENANT_USER_INVITE_REQUESTED,
    tenantId,
    jobType: "tenant-user.invite.requested",
    resourceId: invitation.id,
    payload: {
      invitationId: invitation.id,
      inviteeEmail: invitation.email,
      invitedRole: invitation.role,
    },
  };
}
