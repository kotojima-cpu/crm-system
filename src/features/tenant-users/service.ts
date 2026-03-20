/**
 * Tenant User Service
 *
 * テナント管理者によるユーザー管理。
 * 招待メールは transaction 内送信禁止 — outbox event 登録までに留める。
 */

import { withTenantTx } from "@/shared/db";
import { ValidationError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type {
  ListTenantUsersInput,
  ListTenantUsersResult,
  CreateInvitationInput,
  InvitationRecord,
  TenantUserServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildTenantUserInviteRequestedAudit } from "./audit";
import { buildTenantUserInviteRequestedOutbox } from "./outbox";

/** 招待トークンの有効期限（7日） */
const INVITATION_EXPIRY_DAYS = 7;

/** テナントユーザー一覧取得 */
export async function listTenantUsers(
  ctx: TenantUserServiceContext,
  input: ListTenantUsersInput,
): Promise<ListTenantUsersResult> {
  const { data, total } = await withTenantTx(ctx.tenantId, async (tx) => {
    return repo.findManyByTenant(tx, ctx.tenantId, {
      page: input.page,
      limit: input.limit,
    });
  });

  return {
    data,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

/** 招待予約登録 */
export async function createInvitation(
  ctx: TenantUserServiceContext,
  input: CreateInvitationInput,
): Promise<InvitationRecord> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    // 重複チェック: 同一メールで pending 招待が存在する場合はエラー
    const existing = await repo.findPendingInvitationByEmail(
      tx,
      ctx.tenantId,
      input.email,
    );
    if (existing) {
      throw new ValidationError(
        "このメールアドレスには既に有効な招待が送信されています",
      );
    }

    // 招待レコード作成
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const invitation = await repo.createInvitationForTenant(tx, ctx.tenantId, {
      email: input.email,
      role: input.role,
      invitedBy: ctx.actorUserId as number,
      expiresAt,
    });

    // AuditLog
    await writeAuditLog(
      tx,
      buildTenantUserInviteRequestedAudit(invitation, ctx.tenantId),
    );

    // Outbox — worker が後で mailer を使ってメール送信する
    await writeOutboxEvent(
      tx,
      buildTenantUserInviteRequestedOutbox(invitation, ctx.tenantId),
    );

    return invitation;
  });
}
