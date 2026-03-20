/**
 * 型ヘルパー関数
 *
 * Branded type の生成・検証ユーティリティ。
 */

import { randomUUID } from "crypto";
import type { TenantId, ActorUserId, RequestId } from "./index";

/** number を TenantId に変換（正の整数のみ） */
export function toTenantId(value: number): TenantId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid TenantId: ${value}`);
  }
  return value as TenantId;
}

/** number を ActorUserId に変換（正の整数のみ） */
export function toActorUserId(value: number): ActorUserId {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ActorUserId: ${value}`);
  }
  return value as ActorUserId;
}

/** 新しい RequestId を生成する（UUID v4） */
export function generateRequestId(): RequestId {
  return randomUUID() as RequestId;
}

/** 既存の文字列を RequestId として受け入れる（外部からの引継ぎ用） */
export function toRequestId(value: string): RequestId {
  if (!value || typeof value !== "string") {
    throw new Error(`Invalid RequestId: ${value}`);
  }
  return value as RequestId;
}
