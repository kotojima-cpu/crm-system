/**
 * tenant-user.invite.requested Worker Handler
 *
 * テナントユーザー招待のメール送信。
 * DB 再確認 → expiration / status 確認 → Mailer 送信。
 */

import { createMailer } from "@/infrastructure";
import { assertWorkerTenantOwnership } from "../validators";
import type { WorkerHandlerArgs, WorkerProcessResult } from "../types";

export async function handleTenantUserInviteRequested({
  tx,
  job,
}: WorkerHandlerArgs): Promise<WorkerProcessResult> {
  const { payload, tenantId, actorUserId, requestId, executionContext } =
    job.payloadEnvelope;

  const invitationId = payload.invitationId as number;
  if (!invitationId) {
    return { status: "dead", errorMessage: "payload.invitationId is missing" };
  }

  // 1. DB 再確認
  const invitation = await tx.tenantUserInvitation.findFirst({
    where: { id: invitationId },
  });
  if (!invitation) {
    return {
      status: "dead",
      errorMessage: `Invitation ${invitationId} not found`,
    };
  }

  // 2. tenant ownership 確認
  assertWorkerTenantOwnership({
    payloadTenantId: tenantId as number | null,
    dbTenantId: invitation.tenantId,
    eventType: job.eventType,
    resourceId: invitationId,
  });

  // 3. 招待済み / 失効済みの扱い
  if (invitation.status === "accepted") {
    return { status: "sent" }; // すでに受理済み → 送信不要
  }
  if (invitation.status === "expired" || invitation.status === "cancelled") {
    return {
      status: "dead",
      errorMessage: `Invitation ${invitationId} is ${invitation.status}`,
    };
  }
  if (invitation.expiresAt < new Date()) {
    return {
      status: "dead",
      errorMessage: `Invitation ${invitationId} has expired`,
    };
  }

  // 4. tenant 名取得
  const tenant = await tx.tenant.findFirst({
    where: { id: invitation.tenantId },
    select: { name: true },
  });

  // 5. Mailer 送信
  const mailer = createMailer();
  const result = await mailer.send({
    to: invitation.email,
    subject: `${tenant?.name ?? "システム"} への招待`,
    text: [
      `${tenant?.name ?? "システム"} へ招待されました。`,
      "",
      `以下のリンクからアカウントを設定してください。`,
      `招待トークン: ${invitation.token}`,
      "",
      `この招待は ${invitation.expiresAt.toISOString().slice(0, 10)} まで有効です。`,
    ].join("\n"),
    tenantId: tenantId as number | null,
    actorUserId: actorUserId as number | null,
    requestId: requestId as string,
    executionContext,
  });

  if (!result.ok) {
    return {
      status: "failed",
      errorMessage: result.errorMessage,
      retryable: result.retryable,
    };
  }

  return { status: "sent" };
}
