/**
 * AuditLog Writer
 *
 * 設計書: security-design.md §9
 *
 * transaction 内で AuditLog を記録する。
 * DB 更新と同一 transaction で記録することで、
 * 「業務処理は成功したが監査ログだけ欠落する」状態を防ぐ。
 *
 * ┌─ 利用ルール ─────────────────────────────────────────────────────────┐
 * │ 1. writeAuditLog は必ず transaction 内で呼ぶこと                     │
 * │ 2. withPlatformTx を使う処理では AuditLog 記録を原則必須とする       │
 * │ 3. AuditLog 書き込み失敗は transaction 全体失敗として扱う            │
 * │ 4. 外部副作用（メール送信等）の成否は AuditLog に記録しない          │
 * │    → 外部副作用は Outbox / CloudWatch Logs で追跡する                │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import type { TxClient } from "@/shared/db";
import { getRequestContext } from "@/shared/context";
import { logger } from "@/shared/logging";
import type { WriteAuditLogInput, ResolvedAuditLogInput } from "./types";
import {
  resolveEffectiveTenantId,
  resolveTargetTenantId,
  sanitizeAuditMetadata,
  safeJsonStringify,
} from "./helpers";

/**
 * RequestContext と入力を統合して ResolvedAuditLogInput を生成する。
 *
 * RequestContext が存在する場合は自動補完する。
 * RequestContext がない場合は、必須項目（requestId, executionContext, actorRole）が
 * 明示されていなければエラーを投げる。
 */
export function buildAuditLogInput(
  input: WriteAuditLogInput,
): ResolvedAuditLogInput {
  const ctx = getRequestContext();

  // requestId の解決
  const requestId = input.requestId ?? ctx?.requestId;
  if (!requestId) {
    throw new Error(
      "AuditLog: requestId is required. Set RequestContext or pass it explicitly.",
    );
  }

  // executionContext の解決
  const executionContext = input.executionContext ?? ctx?.executionContext;
  if (!executionContext) {
    throw new Error(
      "AuditLog: executionContext is required. Set RequestContext or pass it explicitly.",
    );
  }

  // actorRole の解決
  const actorRole = input.actorRole ?? ctx?.actorRole;
  if (!actorRole) {
    throw new Error(
      "AuditLog: actorRole is required. Set RequestContext or pass it explicitly.",
    );
  }

  // actorUserId の解決
  const actorUserId = input.actorUserId ?? ctx?.actorUserId ?? null;

  // tenantId の解決
  const jwtTenantId = ctx?.tenantId ?? null;
  const requestedTenantId = input.requestedTenantId ?? jwtTenantId;
  const effectiveTenantId =
    input.effectiveTenantId ??
    resolveEffectiveTenantId({
      executionContext,
      jwtTenantId,
      targetTenantId: input.targetTenantId,
    });
  const targetTenantId =
    input.targetTenantId ??
    resolveTargetTenantId({
      executionContext,
      targetTenantId: input.targetTenantId,
    });

  return {
    requestId,
    actorUserId,
    actorRole,
    executionContext,
    requestedTenantId,
    effectiveTenantId,
    targetTenantId,
    resourceType: input.resourceType,
    action: input.action,
    recordId: input.recordId ?? null,
    result: input.result,
    message: input.message ?? null,
    oldValues: safeJsonStringify(input.oldValues),
    newValues: safeJsonStringify(input.newValues),
    metadata: sanitizeAuditMetadata(input.metadata),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    requestPath: input.requestPath ?? null,
  };
}

/**
 * 監査拡張情報（auditMeta）を組み立てる。
 *
 * 現行スキーマには正式カラムがないため、この構造体を
 * newValues の envelope に埋め込んで DB に永続化する。
 */
function buildAuditMeta(resolved: ResolvedAuditLogInput): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    requestId: resolved.requestId,
    executionContext: resolved.executionContext,
    actorRole: resolved.actorRole,
    result: resolved.result,
  };

  if (resolved.requestedTenantId !== null) {
    meta.requestedTenantId = resolved.requestedTenantId;
  }
  if (resolved.effectiveTenantId !== null) {
    meta.effectiveTenantId = resolved.effectiveTenantId;
  }
  if (resolved.targetTenantId !== null) {
    meta.targetTenantId = resolved.targetTenantId;
  }
  if (resolved.message) {
    meta.message = resolved.message;
  }
  if (resolved.metadata) {
    try {
      meta.metadata = JSON.parse(resolved.metadata);
    } catch {
      meta.metadata = resolved.metadata;
    }
  }
  if (resolved.userAgent) {
    meta.userAgent = resolved.userAgent;
  }
  if (resolved.requestPath) {
    meta.requestPath = resolved.requestPath;
  }

  return meta;
}

/**
 * newValues を envelope 構造で DB 保存用 JSON に変換する。
 *
 * 暫定保存構造:
 * {
 *   "business": <元の newValues オブジェクト or null>,
 *   "auditMeta": { requestId, executionContext, actorRole, result, ... }
 * }
 *
 * この envelope により:
 * - 業務データ（business）と監査メタ（auditMeta）を明確に分離
 * - スキーマ移行時に auditMeta を正式カラムへ移設しやすい
 * - 既存の oldValues はそのまま変更前値として保持
 */
function buildNewValuesEnvelope(resolved: ResolvedAuditLogInput): string {
  const businessValues = resolved.newValues
    ? JSON.parse(resolved.newValues)
    : null;

  return JSON.stringify({
    business: businessValues,
    auditMeta: buildAuditMeta(resolved),
  });
}

/**
 * transaction 内で AuditLog を記録する。
 *
 * 現行スキーマ（AuditLog テーブル）に合わせて書き込む。
 * 正式カラムがない拡張フィールドは newValues の envelope 構造に
 * 暫定保存し、DB に確実に永続化する。
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ REQUIRED AFTER MULTI-TENANT SCHEMA MIGRATION                      │
 * │                                                                    │
 * │ AuditLog テーブルに以下のカラムを追加後、書き込みを拡張する:       │
 * │   - requestId: String                                              │
 * │   - executionContext: String                                       │
 * │   - actorRole: String                                              │
 * │   - requestedTenantId: Int?                                        │
 * │   - effectiveTenantId: Int?                                        │
 * │   - targetTenantId: Int?                                           │
 * │   - resourceType: String                                           │
 * │   - result: String                                                 │
 * │   - message: String?                                               │
 * │   - metadata: String?                                              │
 * │   - userAgent: String?                                             │
 * │   - requestPath: String?                                           │
 * │                                                                    │
 * │ 現行の暫定保存方式:                                                │
 * │   newValues に envelope 構造で監査拡張情報を保存している:           │
 * │   { "business": <元の newValues>, "auditMeta": { ... } }           │
 * │   oldValues は変更前値をそのまま保持。                              │
 * │                                                                    │
 * │ 移行時の手順:                                                      │
 * │   1. 上記カラムを AuditLog テーブルに追加                          │
 * │   2. tx.auditLog.create() で正式カラムに直接書き込むよう変更       │
 * │   3. newValues を envelope ではなく元の business 値のみに戻す       │
 * │   4. 既存データの移行: newValues.auditMeta → 正式カラムへ          │
 * │   5. buildNewValuesEnvelope() / buildAuditMeta() を削除            │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export async function writeAuditLog(
  tx: TxClient,
  input: WriteAuditLogInput,
): Promise<void> {
  const resolved = buildAuditLogInput(input);

  // newValues を envelope 構造に変換（監査拡張情報を DB に永続化）
  const newValuesEnvelope = buildNewValuesEnvelope(resolved);

  // 現行スキーマに合わせた書き込み
  // tableName は resourceType を使用（現行スキーマの tableName カラムに対応）
  await tx.auditLog.create({
    data: {
      userId: resolved.actorUserId as number | null,
      action: resolved.action,
      tableName: resolved.resourceType,
      recordId: resolved.recordId,
      oldValues: resolved.oldValues,
      newValues: newValuesEnvelope,
      ipAddress: resolved.ipAddress,
    },
  });

  // CloudWatch にも出力（requestId で AuditLog レコードと突合可能）
  logger.info("AuditLog recorded", {
    auditRequestId: resolved.requestId as string,
    auditAction: resolved.action,
    auditResourceType: resolved.resourceType,
    auditRecordId: resolved.recordId,
    auditResult: resolved.result,
    auditExecutionContext: resolved.executionContext,
    auditActorUserId: resolved.actorUserId as number | null,
    auditActorRole: resolved.actorRole,
    auditEffectiveTenantId: resolved.effectiveTenantId as number | null,
    auditMessage: resolved.message,
  });
}

// --- 利用例（コメント） ---

/*
 * === 利用例 1: テナントユーザーが顧客を作成 ===
 *
 * import { writeAuditLog } from "@/audit";
 * import { AUDIT_CUSTOMER_CREATED } from "@/audit";
 *
 * await withTenantTx(user.tenantId, async (tx) => {
 *   const customer = await tx.customer.create({ data: { ... } });
 *
 *   await writeAuditLog(tx, {
 *     ...AUDIT_CUSTOMER_CREATED,
 *     recordId: customer.id,
 *     result: "success",
 *     newValues: { companyName: customer.companyName },
 *   });
 *
 *   return customer;
 * });
 *
 * === 利用例 2: platform_admin がテナントを停止 ===
 *
 * await withPlatformTx(async (tx) => {
 *   await tx.tenant.update({ where: { id: tenantId }, data: { status: "suspended" } });
 *
 *   await writeAuditLog(tx, {
 *     ...AUDIT_TENANT_SUSPENDED,
 *     recordId: tenantId as number,
 *     targetTenantId: tenantId,
 *     result: "success",
 *     message: `Tenant ${tenantId} suspended by platform admin`,
 *     oldValues: { status: "active" },
 *     newValues: { status: "suspended" },
 *   });
 * });
 *
 * === 利用例 3: 請求書を confirm ===
 *
 * await withTenantTx(user.tenantId, async (tx) => {
 *   await tx.invoice.update({ where: { id: invoiceId }, data: { status: "confirmed" } });
 *
 *   await writeAuditLog(tx, {
 *     ...AUDIT_INVOICE_CONFIRMED,
 *     recordId: invoiceId,
 *     result: "success",
 *     oldValues: { status: "draft" },
 *     newValues: { status: "confirmed" },
 *   });
 * });
 *
 * === 利用例 4: 認可失敗の監査記録 ===
 *
 * 認可失敗は transaction 外で発生するため、writeAuditLog は使わない。
 * 代わりに以下の方針で記録する:
 *   - ForbiddenError / TenantOwnershipError → logger.warn() で構造化ログ出力
 *   - SessionExpiredError → logger.warn() で構造化ログ出力
 *   - CloudWatch Logs で requestId による追跡が可能
 *   - 監査要件が高い場合は、エラーハンドラー内で別途
 *     getSystemPrisma() を使って AuditLog に記録することも可能だが、
 *     transaction 保証がないため例外的扱いとする
 */
