/**
 * リクエストコンテキスト管理
 *
 * Node.js の AsyncLocalStorage を使い、リクエストスコープの文脈情報を
 * 関数引数なしで任意の深さから参照可能にする。
 *
 * 使い方:
 *   runWithRequestContext(ctx, async () => { ... });
 *   const ctx = getRequestContext();
 */

import { AsyncLocalStorage } from "async_hooks";
import type { RequestContext, RequestId, TenantId, ActorUserId, ExecutionContext } from "../types";
import { generateRequestId } from "../types/helpers";

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * リクエストコンテキストを設定してコールバックを実行する。
 * API ルートの入口、worker の入口で呼び出す。
 */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * 現在のリクエストコンテキストを取得する。
 * コンテキスト外で呼ばれた場合は null を返す。
 */
export function getRequestContext(): RequestContext | null {
  return requestContextStorage.getStore() ?? null;
}

/**
 * 現在のリクエストコンテキストを取得する（必須版）。
 * コンテキスト外で呼ばれた場合はエラーを投げる。
 */
export function requireRequestContext(): RequestContext {
  const ctx = requestContextStorage.getStore();
  if (!ctx) {
    throw new Error("RequestContext is not set. Ensure runWithRequestContext() is called.");
  }
  return ctx;
}

/**
 * API リクエストからリクエストコンテキストを生成する。
 * x-request-id ヘッダーがあれば引継ぎ、なければ新規生成。
 */
export function createRequestContextFromHeaders(
  headers: Headers,
  options: {
    executionContext: ExecutionContext;
    tenantId: TenantId | null;
    actorUserId: ActorUserId | null;
    actorRole: string | null;
  },
): RequestContext {
  const existingRequestId = headers.get("x-request-id");
  const requestId: RequestId = existingRequestId
    ? (existingRequestId as RequestId)
    : generateRequestId();

  return {
    requestId,
    executionContext: options.executionContext,
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    actorRole: options.actorRole,
  };
}

/**
 * worker / バッチ用のリクエストコンテキストを生成する。
 * 非同期 payload から requestId を引き継ぐ。
 */
export function createRequestContextForWorker(options: {
  requestId: RequestId;
  executionContext: ExecutionContext;
  tenantId: TenantId | null;
  actorUserId: ActorUserId | null;
  actorRole: string | null;
}): RequestContext {
  return {
    requestId: options.requestId,
    executionContext: options.executionContext,
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    actorRole: options.actorRole,
  };
}
