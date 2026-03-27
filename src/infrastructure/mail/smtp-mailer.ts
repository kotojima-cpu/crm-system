/**
 * SMTP Mailer
 *
 * nodemailer を使った SMTP メール送信。
 * さくら VPS / 外部 SMTP サーバーに対応。
 *
 * 必要な環境変数:
 *   SMTP_HOST     — SMTPサーバーホスト
 *   SMTP_PORT     — ポート番号（587 = STARTTLS, 465 = SSL）
 *   SMTP_USER     — 認証ユーザー
 *   SMTP_PASSWORD — 認証パスワード（Secret 経由推奨）
 *   MAIL_FROM     — 送信元アドレス
 */

import nodemailer from "nodemailer";
import { logger } from "@/shared/logging";
import type { Mailer } from "./interface";
import type { MailSendInput, MailSendResult } from "./types";

export class SmtpMailer implements Mailer {
  async send(input: MailSendInput): Promise<MailSendResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const from = process.env.MAIL_FROM || user;

    if (!host || !user || !pass) {
      logger.error("[SmtpMailer] SMTP settings missing", {
        hasHost: !!host,
        hasUser: !!user,
        hasPass: !!pass,
        requestId: input.requestId,
      });
      return {
        ok: false,
        errorMessage: "SMTP設定が不足しています（SMTP_HOST, SMTP_USER, SMTP_PASSWORD）",
        retryable: false,
      };
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;

    try {
      const result = await transport.sendMail({
        from,
        to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      logger.info("[SmtpMailer] Mail sent", {
        messageId: result.messageId,
        to,
        subject: input.subject,
        requestId: input.requestId,
      });

      return {
        ok: true,
        providerMessageId: result.messageId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown SMTP error";
      // パスワード等の秘密情報を含む可能性があるため、エラーメッセージのみ出力
      logger.error("[SmtpMailer] Send failed", {
        error: message,
        to,
        subject: input.subject,
        requestId: input.requestId,
      });

      return {
        ok: false,
        errorMessage: `SMTP送信失敗: ${message}`,
        retryable: true,
      };
    } finally {
      transport.close();
    }
  }
}
