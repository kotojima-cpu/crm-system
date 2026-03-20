/**
 * Infrastructure 環境設定
 *
 * 環境変数から RuntimeEnvironment / InfrastructureMode を読み取る。
 * staging / production の切替やガードフラグの判定もここに集約する。
 *
 * 環境変数:
 *   APP_ENV                   — local | test | staging | production
 *   INFRASTRUCTURE_MODE       — local | aws
 *   AWS_REGION                — ap-northeast-1 etc.
 *   AWS_SES_FROM              — SES 送信元アドレス
 *   AWS_SQS_QUEUE_URL         — SQS キュー URL
 *   DISABLE_REAL_EMAIL_SEND   — "true" で staging の実メール送信を抑止
 *   DISABLE_REAL_WEBHOOK_SEND — "true" で staging の実 webhook 送信を抑止
 *   ALLOWED_EMAIL_DOMAINS     — staging allowlist（カンマ区切り、例: "example.com,test.local"）
 *   ALLOWED_WEBHOOK_HOSTS     — staging allowlist（カンマ区切り、例: "hooks.staging.local,httpbin.org"）
 */

import type { RuntimeEnvironment, InfrastructureMode } from "./types";

// --- 基本環境判定 ---

/** 現在の実行環境を取得 */
export function getRuntimeEnvironment(): RuntimeEnvironment {
  const env = process.env.APP_ENV ?? "local";
  if (["local", "test", "staging", "production"].includes(env)) {
    return env as RuntimeEnvironment;
  }
  return "local";
}

/** インフラ実装モードを取得 */
export function getInfrastructureMode(): InfrastructureMode {
  const mode = process.env.INFRASTRUCTURE_MODE ?? "local";
  if (["local", "aws"].includes(mode)) {
    return mode as InfrastructureMode;
  }
  return "local";
}

/** 本番環境か */
export function isProduction(): boolean {
  return getRuntimeEnvironment() === "production";
}

/** ステージング環境か */
export function isStaging(): boolean {
  return getRuntimeEnvironment() === "staging";
}

/** AWS モードか */
export function isAwsMode(): boolean {
  return getInfrastructureMode() === "aws";
}

/** AWS リージョンを取得 */
export function getAwsRegion(): string {
  return process.env.AWS_REGION ?? "ap-northeast-1";
}

/** SES 送信元アドレスを取得 */
export function getSesFromAddress(): string {
  return process.env.AWS_SES_FROM ?? "noreply@example.com";
}

/** SQS キュー URL を取得 */
export function getSqsQueueUrl(): string {
  return process.env.AWS_SQS_QUEUE_URL ?? "";
}

// --- 送信制御フラグ ---

/** 実メール送信が無効化されているか */
export function isRealEmailDisabled(): boolean {
  return process.env.DISABLE_REAL_EMAIL_SEND === "true";
}

/** 実 webhook 送信が無効化されているか */
export function isRealWebhookDisabled(): boolean {
  return process.env.DISABLE_REAL_WEBHOOK_SEND === "true";
}

/**
 * 外部送信が許可されるか判定する。
 *
 * - production → 常に許可
 * - staging → disableFlag が false のときのみ許可
 * - local / test → 常に不許可
 */
export function isExternalSendAllowed(disableFlag: boolean): boolean {
  const env = getRuntimeEnvironment();
  if (env === "production") return true;
  if (env === "staging") return !disableFlag;
  return false;
}

/** 実メール送信が許可されるか（disable flag + 環境を総合判定） */
export function isRealEmailSendAllowed(): boolean {
  return isExternalSendAllowed(isRealEmailDisabled());
}

/** 実 webhook 送信が許可されるか（disable flag + 環境を総合判定） */
export function isRealWebhookSendAllowed(): boolean {
  return isExternalSendAllowed(isRealWebhookDisabled());
}

// --- Allowlist ---

/**
 * 許可されたメール送信先ドメインの一覧を取得する。
 *
 * ALLOWED_EMAIL_DOMAINS が未設定の場合は空配列を返す。
 * production では空配列（= 制限なし）として扱う。
 *
 * 例: ALLOWED_EMAIL_DOMAINS="example.com,test.local"
 *   → ["example.com", "test.local"]
 */
export function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? "";
  if (!raw.trim()) return [];
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

/**
 * 許可された webhook 送信先ホストの一覧を取得する。
 *
 * ALLOWED_WEBHOOK_HOSTS が未設定の場合は空配列を返す。
 * production では空配列（= 制限なし）として扱う。
 *
 * 例: ALLOWED_WEBHOOK_HOSTS="hooks.staging.local,httpbin.org"
 *   → ["hooks.staging.local", "httpbin.org"]
 */
export function getAllowedWebhookHosts(): string[] {
  const raw = process.env.ALLOWED_WEBHOOK_HOSTS ?? "";
  if (!raw.trim()) return [];
  return raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/**
 * メール宛先が allowlist に含まれるか判定する。
 *
 * ルール:
 * - production → 常に許可
 * - allowlist が空 → staging では不許可（明示的な許可が必要）
 * - allowlist に一致するドメインがあれば許可
 */
export function isAllowedEmailRecipient(email: string): boolean {
  if (isProduction()) return true;

  const domains = getAllowedEmailDomains();
  if (domains.length === 0) return false;

  const emailDomain = email.toLowerCase().split("@")[1];
  if (!emailDomain) return false;

  return domains.includes(emailDomain);
}

/**
 * webhook endpoint が allowlist に含まれるか判定する。
 *
 * ルール:
 * - production → 常に許可
 * - allowlist が空 → staging では不許可（明示的な許可が必要）
 * - allowlist に一致するホストがあれば許可
 */
export function isAllowedWebhookEndpoint(url: string): boolean {
  if (isProduction()) return true;

  const hosts = getAllowedWebhookHosts();
  if (hosts.length === 0) return false;

  try {
    const parsed = new URL(url);
    return hosts.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
