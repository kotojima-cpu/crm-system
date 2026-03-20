/**
 * テナント分離 transaction ラッパー
 *
 * 設計書: tenant-auth-design.md §5.2, §10
 *
 * withTenantTx — テナントユーザー用。RLS 適用。
 * withPlatformTx — platform_admin 用。RLS BYPASS。
 *
 * ルール:
 * - tenant 系処理は必ず withTenantTx を通す
 * - platform 系処理は必ず withPlatformTx を通す
 * - transaction 外で tenant 前提の query を直書きしない
 * - SET LOCAL はトランザクション終了時に自動リセット
 * - $executeRawUnsafe はこのファイル内部のみ許可
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma-client";
import type { TenantId } from "../types";
import { logger } from "../logging";

/** Prisma のトランザクションクライアント型 */
export type TxClient = Prisma.TransactionClient;

/**
 * テナントユーザー用トランザクション。
 *
 * transaction 内で以下を実行:
 * 1. SET LOCAL app.current_tenant_id = '{tenantId}'
 * 2. SET LOCAL ROLE app_tenant_role
 * 3. fn(tx) を実行
 *
 * transaction 終了後、SET LOCAL は自動リセットされる。
 */
export async function withTenantTx<T>(
  tenantId: TenantId,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  // tenantId のバリデーション（SQL インジェクション防止）
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error(`Invalid tenantId: ${tenantId}`);
  }

  return prisma.$transaction(async (tx) => {
    // テナントコンテキスト設定（RLS が参照する値）
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_tenant_id = '${tenantId}'`,
    );
    // テナントロール設定（RLS 適用）
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_tenant_role`);

    logger.debug("withTenantTx: context set", { tenantId });

    return fn(tx);
  });
}

/**
 * platform_admin 用トランザクション。
 *
 * transaction 内で以下を実行:
 * 1. SET LOCAL ROLE app_platform_role（BYPASSRLS）
 * 2. fn(tx) を実行
 *
 * RLS をバイパスするため、全テナントデータにアクセス可能。
 * 監査ログ必須。
 *
 * ┌─ DANGER ─────────────────────────────────────────────────────────────┐
 * │ この関数は RLS を完全にバイパスする。                                │
 * │ 呼び出し元は必ず requirePlatformAccess() を通過済みであること。      │
 * │ 業務データの取得・更新時は監査ログ (AuditLog) の記録を必須とする。   │
 * │ テナント系処理では絶対に使用しないこと → withTenantTx を使う。       │
 * │ コードレビューで本関数の利用箇所は重点チェック対象とする。           │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export async function withPlatformTx<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // platform ロール設定（BYPASSRLS）
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_platform_role`);

    logger.debug("withPlatformTx: context set (BYPASSRLS)");

    return fn(tx);
  });
}

/**
 * system コンテキスト用トランザクション。
 *
 * worker の system executionContext や、認証前のバッチ処理で使用。
 * RLS 未適用の transaction ラッパー。
 *
 * ┌─ DANGER ─────────────────────────────────────────────────────────────┐
 * │ RLS 未適用 — 全データにフィルタなしでアクセスする。                  │
 * │                                                                      │
 * │ 許可される用途（ホワイトリスト）:                                    │
 * │   - worker の system コンテキスト処理                                │
 * │   - ステータスバッチ更新                                             │
 * │   - ヘルスチェック / メンテナンス                                    │
 * │                                                                      │
 * │ 禁止される用途:                                                      │
 * │   - テナントユーザーのリクエスト処理                                 │
 * │   - tenant 文脈が必要な業務データ操作                                │
 * │                                                                      │
 * │ 新規利用箇所を追加する場合はコードレビューで承認を得ること。         │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export async function withSystemTx<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    logger.debug("withSystemTx: system context (no RLS)");
    return fn(tx);
  });
}

/**
 * system コンテキスト用の DB アクセス（non-transaction）。
 *
 * 認証前の最小処理（ログイン認証、パスワードリセット等）で使用。
 * RLS 未適用。素の prisma クライアントを返す。
 *
 * ┌─ DANGER ─────────────────────────────────────────────────────────────┐
 * │ RLS 未適用 — 全データにフィルタなしでアクセスする。                  │
 * │                                                                      │
 * │ 許可される用途（ホワイトリスト）:                                    │
 * │   - ログイン認証（Credentials Provider コールバック）                │
 * │   - パスワードリセット                                               │
 * │   - ヘルスチェック                                                   │
 * │   - マイグレーション / シード                                        │
 * │                                                                      │
 * │ 禁止される用途:                                                      │
 * │   - 顧客・契約・請求書など業務データの取得・更新                     │
 * │   - テナントユーザーのリクエスト処理                                 │
 * │                                                                      │
 * │ 新規利用箇所を追加する場合はコードレビューで承認を得ること。         │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export function getSystemPrisma(): PrismaClient {
  return prisma;
}
