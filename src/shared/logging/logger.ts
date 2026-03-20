/**
 * 構造化ロガー
 *
 * 全ログ出力に requestId / tenantId / executionContext を自動注入する。
 * リクエストコンテキストが存在すれば自動取得、なければ手動指定可。
 *
 * 本番では CloudWatch Logs に JSON 形式で出力する前提。
 *
 * ┌─ 機密情報マスキング方針（修正F）──────────────────────────────────────┐
 * │                                                                      │
 * │ ログに以下の情報を平文で出力してはならない:                          │
 * │   - パスワード / passwordHash                                        │
 * │   - セッショントークン / JWT                                         │
 * │   - API キー / シークレット                                          │
 * │   - 2FA シークレット / リカバリコード                                 │
 * │   - 個人情報（メールアドレス、電話番号は部分マスク可）               │
 * │                                                                      │
 * │ 呼び出し側の責務:                                                    │
 * │   extra パラメータに機密フィールドを含めないこと。                   │
 * │   やむを得ず含める場合は maskSensitive() でマスクしてから渡す。      │
 * │                                                                      │
 * │ 安全に出力可能な識別子:                                              │
 * │   userId, tenantId, requestId, loginId（ユーザー名相当）             │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { getRequestContext } from "../context/request-context";

/** ログ出力禁止フィールド名（extra に含まれていたら警告） */
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apiKey/i,
  /authorization/i,
  /cookie/i,
  /creditCard/i,
  /recoveryCode/i,
];

/**
 * 機密情報をマスクする。
 * ログに含めざるを得ない場合に使用する。
 *
 * @example
 *   logger.info("Login attempt", { loginId, email: maskSensitive(email) });
 */
export function maskSensitive(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "****" + value.slice(-2);
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId: string | null;
  tenantId: number | null;
  executionContext: string | null;
  actorUserId: number | null;
  [key: string]: unknown;
}

/**
 * extra に機密フィールド名が含まれていないか検査する（開発時のみ）。
 * 本番では検査コストを避けるためスキップする。
 */
function warnIfSensitiveFields(extra?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" || !extra) return;
  for (const key of Object.keys(extra)) {
    if (SENSITIVE_FIELD_PATTERNS.some((p) => p.test(key))) {
      console.warn(
        `[logger] WARNING: extra field "${key}" may contain sensitive data. Use maskSensitive() or remove it.`,
      );
    }
  }
}

function buildLogEntry(
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
): LogEntry {
  warnIfSensitiveFields(extra);

  const ctx = getRequestContext();

  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId: ctx?.requestId ?? null,
    tenantId: ctx?.tenantId ?? null,
    executionContext: ctx?.executionContext ?? null,
    actorUserId: ctx?.actorUserId ?? null,
    ...extra,
  };
}

function writeLog(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(output);
  } else if (entry.level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/** 構造化ロガー */
export const logger = {
  debug(message: string, extra?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    writeLog(buildLogEntry("debug", message, extra));
  },

  info(message: string, extra?: Record<string, unknown>): void {
    writeLog(buildLogEntry("info", message, extra));
  },

  warn(message: string, extra?: Record<string, unknown>): void {
    writeLog(buildLogEntry("warn", message, extra));
  },

  error(message: string, error?: unknown, extra?: Record<string, unknown>): void {
    const errorInfo: Record<string, unknown> = { ...extra };
    if (error instanceof Error) {
      errorInfo.errorName = error.name;
      errorInfo.errorMessage = error.message;
      errorInfo.stack = error.stack;
    }
    writeLog(buildLogEntry("error", message, errorInfo));
  },
};
