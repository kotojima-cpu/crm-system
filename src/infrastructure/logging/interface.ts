/**
 * LoggerAdapter Interface
 *
 * 既存の shared/logging/logger は維持しつつ、
 * 外部ログ sink を切り替えられる足場。
 */

import type { StructuredLogEntry } from "./types";

export interface LoggerAdapter {
  /** 構造化ログを外部 sink に送信 */
  write(entry: StructuredLogEntry): void;
  /** バッファをフラッシュ（必要な場合） */
  flush?(): Promise<void>;
}
