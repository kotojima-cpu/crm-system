/**
 * SES Mailer
 *
 * Amazon SES を使ったメール送信実装。
 * AWS SDK 呼び出しはこのファイルに閉じ込める。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番利用前に以下を完了すること:                                       │
 * │   1. SES production access 申請                                      │
 * │   2. 送信ドメイン検証（SPF / DKIM / DMARC）                          │
 * │   3. FROM アドレス設定（環境変数 AWS_SES_FROM）                       │
 * │   4. AWS SDK v3 の @aws-sdk/client-ses インストール                   │
 * │   5. IAM 実行ロールに ses:SendEmail / ses:SendRawEmail 権限付与      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * staging 安全ガード（2層）:
 * 1. isRealEmailSendAllowed() — 環境 + disable flag チェック
 * 2. isAllowedEmailRecipient(email) — allowlist ドメインチェック
 * 両方通過した宛先のみ実送信する。
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { logger } from "@/shared/logging";
import {
  isRealEmailSendAllowed,
  isAllowedEmailRecipient,
  getSesFromAddress,
  getAwsRegion,
} from "../config";
import type { Mailer } from "./interface";
import type { MailSendInput, MailSendResult } from "./types";

export class SesMailer implements Mailer {
  async send(input: MailSendInput): Promise<MailSendResult> {
    const toAddresses = Array.isArray(input.to) ? input.to : [input.to];

    // --- ガード 1: 環境レベルの送信可否 ---
    if (!isRealEmailSendAllowed()) {
      logger.info("[SesMailer] Real email send is disabled — dry-run", {
        mailTo: toAddresses.join(", "),
        mailSubject: input.subject,
        mailRequestId: input.requestId,
        mailTenantId: input.tenantId,
        mailExecutionContext: input.executionContext,
        mailReason: "environment_disabled",
      });
      return {
        ok: true,
        providerMessageId: null,
        dryRun: true,
        blocked: true,
      };
    }

    // --- ガード 2: allowlist チェック（staging 保護） ---
    const allowedRecipients = toAddresses.filter((addr) =>
      isAllowedEmailRecipient(addr),
    );
    const blockedRecipients = toAddresses.filter(
      (addr) => !isAllowedEmailRecipient(addr),
    );

    if (blockedRecipients.length > 0) {
      logger.warn("[SesMailer] Recipients blocked by allowlist", {
        mailBlockedRecipients: blockedRecipients.join(", "),
        mailAllowedRecipients: allowedRecipients.join(", "),
        mailSubject: input.subject,
        mailRequestId: input.requestId,
        mailTenantId: input.tenantId,
        mailReason: "allowlist_blocked",
      });
    }

    // 全員ブロック → dry-run
    if (allowedRecipients.length === 0) {
      return {
        ok: true,
        providerMessageId: null,
        dryRun: true,
        blocked: true,
      };
    }

    // 許可された宛先だけに実送信
    return this.sendViaSes(allowedRecipients, input);
  }

  /**
   * SES 経由で実送信する。
   * AWS SDK 呼び出しはこのメソッドに閉じ込める。
   */
  private async sendViaSes(
    toAddresses: string[],
    input: MailSendInput,
  ): Promise<MailSendResult> {
    const fromAddress = getSesFromAddress();
    const region = getAwsRegion();

    logger.info("[SesMailer] Sending email via SES", {
      mailTo: toAddresses.join(", "),
      mailSubject: input.subject,
      mailFrom: fromAddress,
      mailRegion: region,
      mailRequestId: input.requestId,
      mailTenantId: input.tenantId,
      mailExecutionContext: input.executionContext,
      mailActorUserId: input.actorUserId,
    });

    try {
      const client = new SESClient({ region });
      const command = new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: toAddresses },
        Message: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            ...(input.text
              ? { Text: { Data: input.text, Charset: "UTF-8" } }
              : {}),
            ...(input.html
              ? { Html: { Data: input.html, Charset: "UTF-8" } }
              : {}),
          },
        },
      });
      const result = await client.send(command);

      return {
        ok: true,
        providerMessageId: result.MessageId ?? null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const retryable = this.isRetryableError(err);

      logger.error("[SesMailer] SES send failed", err instanceof Error ? err : undefined, {
        mailTo: toAddresses.join(", "),
        mailRequestId: input.requestId,
        mailTenantId: input.tenantId,
        mailRetryable: retryable,
      });

      return { ok: false, errorMessage, retryable };
    }
  }

  /**
   * SES エラーがリトライ可能か判定する。
   *
   * - Throttling / ServiceUnavailable → retryable
   * - MessageRejected / InvalidParameterValue → non-retryable
   */
  private isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return true;
    const name = (err as { name?: string }).name ?? "";

    const nonRetryableErrors = [
      "MessageRejected",
      "InvalidParameterValue",
      "AccountSendingPausedException",
      "MailFromDomainNotVerifiedException",
    ];

    return !nonRetryableErrors.includes(name);
  }
}
