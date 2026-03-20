/**
 * Local Mailer
 *
 * 実メール送信を行わない。dry-run として構造化ログ出力する。
 *
 * 対象環境: local / test
 */

import { logger } from "@/shared/logging";
import type { Mailer } from "./interface";
import type { MailSendInput, MailSendResult } from "./types";

export class LocalMailer implements Mailer {
  /** テスト用: 送信された入力を保持 */
  public readonly sent: MailSendInput[] = [];

  async send(input: MailSendInput): Promise<MailSendResult> {
    this.sent.push(input);

    logger.info("[LocalMailer] Mail send (dry-run)", {
      mailTo: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      mailSubject: input.subject,
      mailRequestId: input.requestId,
      mailTenantId: input.tenantId,
      mailExecutionContext: input.executionContext,
      mailActorUserId: input.actorUserId,
    });

    return {
      ok: true,
      providerMessageId: `local-dry-run-${Date.now()}`,
      dryRun: true,
    };
  }
}
