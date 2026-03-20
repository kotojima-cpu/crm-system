/**
 * Outbox ステータス遷移ルール
 *
 * 各ステータスの意味:
 *   pending    — 作成済み、未処理。dispatcher がピックアップ待ち。
 *   processing — dispatcher がピックアップ済み。外部呼び出し中。
 *   sent       — 外部呼び出し成功。完了状態（終端）。
 *   failed     — 外部呼び出し失敗。リトライ可能。
 *   dead       — リトライ上限超過。人手介入が必要（終端）。
 *
 * 遷移図:
 *   pending → processing → sent (終端)
 *                ↓
 *              failed → processing (リトライ)
 *                ↓
 *               dead (終端)
 */

import type { OutboxStatus } from "./types";

/** 許可されるステータス遷移マップ */
const ALLOWED_TRANSITIONS: Record<OutboxStatus, OutboxStatus[]> = {
  // pending → processing: dispatcher がピックアップ
  pending: ["processing"],

  // processing → sent: 外部呼び出し成功
  // processing → failed: 外部呼び出し失敗
  // processing → dead: 非リトライエラー（payload 不正など）
  processing: ["sent", "failed", "dead"],

  // sent: 完了。遷移先なし。
  sent: [],

  // failed → processing: リトライ
  // failed → dead: リトライ上限超過
  failed: ["processing", "dead"],

  // dead: 終端。遷移先なし。人手介入で新規 event を作り直す。
  dead: [],
};

/**
 * ステータス遷移が許可されているか検査する。
 *
 * @returns true なら遷移可能
 */
export function canTransitionOutboxStatus(
  from: OutboxStatus,
  to: OutboxStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * ステータスが終端（これ以上遷移不能）か判定する。
 */
export function isTerminalOutboxStatus(status: OutboxStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/**
 * ステータスがリトライ可能か判定する。
 */
export function isRetryableOutboxStatus(status: OutboxStatus): boolean {
  return status === "failed";
}
