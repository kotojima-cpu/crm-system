/**
 * Infrastructure 共通型定義
 *
 * 全 infrastructure モジュールが参照する共通型。
 * AWS SDK 固有の型はここに含めない。
 */

/** 実行環境 */
export type RuntimeEnvironment =
  | "local"
  | "test"
  | "staging"
  | "production";

/** インフラ実装モード */
export type InfrastructureMode =
  | "local"
  | "aws";

/**
 * 外部送信時に引き継ぐコンテキスト。
 *
 * requestId / tenantId / executionContext を
 * 外部システムへの送信に伝搬するための最小セット。
 */
export interface ExternalDispatchContext {
  requestId: string;
  executionContext: "tenant" | "platform" | "system";
  tenantId: number | null;
  actorUserId: number | null;
  targetTenantId?: number | null;
}

/**
 * tenant 文脈を含む外部送信ペイロード。
 *
 * Mail / Queue / Webhook 等の input は
 * この型を拡張して tenant 文脈を引き継ぐ。
 */
export interface TenantAwareExternalPayload {
  requestId: string;
  executionContext: "tenant" | "platform" | "system";
  tenantId: number | null;
}

/**
 * 外部送信の統一戻り値。
 *
 * 全 infrastructure の send / publish / dispatch は
 * この型で結果を返す。エラーハンドリングを統一する。
 *
 * dryRun — staging で allowlist 外のため実送信せず正常扱いにした場合 true
 * blocked — 環境ガードにより送信自体がブロックされた場合 true
 *
 * staging で「送らなかったが正常」を表現する:
 *   { ok: true, dryRun: true, blocked: true }
 */
export type TransportResult =
  | { ok: true; providerMessageId?: string | null; dryRun?: boolean; blocked?: boolean }
  | { ok: false; errorMessage: string; retryable: boolean; blocked?: boolean };
