/**
 * Mailer Interface
 *
 * SES を直接呼ばず、この interface を通してメール送信する。
 * 業務コード・worker handler は Mailer のみに依存すること。
 */

import type { MailSendInput, MailSendResult } from "./types";

export interface Mailer {
  send(input: MailSendInput): Promise<MailSendResult>;
}
