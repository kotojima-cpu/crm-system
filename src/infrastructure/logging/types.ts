/**
 * LoggerAdapter 型定義
 */

/** 構造化ログエントリ */
export interface StructuredLogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  requestId: string | null;
  tenantId: number | null;
  executionContext: string | null;
  [key: string]: unknown;
}
