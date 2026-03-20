/**
 * Mail 型定義
 */

import type { TenantAwareExternalPayload, TransportResult } from "../types";

/**
 * メール送信入力。
 *
 * tenantId / requestId / executionContext は必須。
 * tenant 文脈なしの送信は明示的に tenantId: null で示す。
 */
export interface MailSendInput extends TenantAwareExternalPayload {
  /** 宛先（単数 or 複数） */
  to: string | string[];
  /** 件名 */
  subject: string;
  /** テキスト本文 */
  text?: string;
  /** HTML 本文 */
  html?: string;
  /** 送信者 ID */
  actorUserId: number | null;
  /** メタデータ（ログ出力用。本文には含めない） */
  metadata?: Record<string, unknown>;
}

/** メール送信結果 = TransportResult */
export type MailSendResult = TransportResult;
