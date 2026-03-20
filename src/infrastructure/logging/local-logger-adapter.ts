/**
 * Local Logger Adapter
 *
 * 既存の console 出力にそのまま委譲する。
 * 追加の外部 sink は利用しない。
 *
 * 対象環境: local / test
 */

import type { LoggerAdapter } from "./interface";
import type { StructuredLogEntry } from "./types";

export class LocalLoggerAdapter implements LoggerAdapter {
  write(entry: StructuredLogEntry): void {
    // 既存の shared/logging/logger が console 出力を担当するため、
    // ここでは追加出力しない（二重出力防止）。
    // 必要に応じてファイル出力や外部 sink を追加可能。
    void entry;
  }
}
