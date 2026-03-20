/**
 * 月次請求バッチ Service
 *
 * tenant 単位の月次請求生成と全 tenant 向けバッチ入口。
 * 冪等性: 同一契約・同一期間で draft/confirmed が存在 → skip (created: false)
 */

import { withTenantTx, withSystemTx } from "@/shared/db";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import { logger } from "@/shared/logging";
import { toTenantId } from "@/shared/types/helpers";
import type { TenantId, ActorUserId } from "@/shared/types";
import type {
  GenerateMonthlyInvoicesInput,
  GenerateMonthlyInvoicesResult,
  GenerateAllTenantsResult,
  GeneratedInvoiceSummary,
  BillingBatchServiceContext,
} from "./types";
import * as repo from "./repository";
import { buildMonthlyInvoiceCreatedAudit, buildMonthlyInvoiceBatchSummaryAudit } from "./audit";
import { buildMonthlyInvoiceCreatedOutbox } from "./outbox";
import { validateTargetMonth } from "./validators";

/**
 * 対象月から請求期間（月初〜月末）を算出する。
 */
function resolveBillingPeriod(targetMonth: string): { periodStart: Date; periodEnd: Date } {
  const [year, month] = targetMonth.split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  // 翌月1日の前日 = 当月末
  const periodEnd = new Date(Date.UTC(year, month, 0));
  return { periodStart, periodEnd };
}

/**
 * 1 tenant 分の月次請求を生成する。
 */
export async function generateMonthlyInvoicesForTenant(
  ctx: BillingBatchServiceContext,
  input: GenerateMonthlyInvoicesInput,
): Promise<GenerateMonthlyInvoicesResult> {
  validateTargetMonth(input.targetMonth);
  const { periodStart, periodEnd } = resolveBillingPeriod(input.targetMonth);
  const tenantId = input.tenantId ? toTenantId(input.tenantId) : ctx.tenantId!;
  const dryRun = input.dryRun === true;

  const summaries: GeneratedInvoiceSummary[] = [];

  await withTenantTx(tenantId, async (tx) => {
    // 対象契約を取得
    const contracts = await repo.findActiveContractsForTenantAndMonth(
      tx, tenantId, periodStart, periodEnd,
    );

    for (const contract of contracts) {
      // 月額費用がない契約はスキップ
      if (contract.monthlyFee === null || contract.monthlyFee <= 0) {
        summaries.push({
          contractId: contract.id,
          invoiceId: null,
          created: false,
          skippedReason: "contract_not_billable",
        });
        continue;
      }

      // 冪等性: 既存 invoice チェック
      const existing = await repo.findExistingInvoiceForContractAndMonth(
        tx, tenantId, contract.id, periodStart, periodEnd,
      );
      if (existing) {
        summaries.push({
          contractId: contract.id,
          invoiceId: existing.id,
          created: false,
          skippedReason: "existing_invoice",
        });
        continue;
      }

      // dryRun ではDBに書かない
      if (dryRun) {
        summaries.push({
          contractId: contract.id,
          invoiceId: null,
          created: true,
          skippedReason: undefined,
        });
        continue;
      }

      // invoice 作成
      const invoice = await tx.invoice.create({
        data: {
          tenantId: tenantId as number,
          contractId: contract.id,
          customerId: contract.customerId,
          periodStart,
          periodEnd,
          amount: contract.monthlyFee,
          status: "draft",
          createdBy: ctx.actorUserId as number,
        },
      });

      // AuditLog
      await writeAuditLog(tx, buildMonthlyInvoiceCreatedAudit(
        invoice, input.targetMonth, tenantId,
      ));

      // Outbox
      await writeOutboxEvent(tx, buildMonthlyInvoiceCreatedOutbox(
        invoice, input.targetMonth, tenantId,
      ));

      summaries.push({
        contractId: contract.id,
        invoiceId: invoice.id,
        created: true,
      });
    }
  });

  const createdCount = summaries.filter((s) => s.created).length;
  const skippedCount = summaries.filter((s) => !s.created).length;

  return {
    tenantId: tenantId as number,
    targetMonth: input.targetMonth,
    totalContracts: summaries.length,
    createdCount,
    skippedCount,
    summaries,
  };
}

/**
 * 全 tenant の月次請求を逐次生成する。
 * system / platform 文脈から呼ぶ。
 * 1 tenant の失敗で全体を止めず、結果に載せる。
 */
export async function generateMonthlyInvoicesForAllTenants(
  ctx: BillingBatchServiceContext,
  input: GenerateMonthlyInvoicesInput,
): Promise<GenerateAllTenantsResult> {
  validateTargetMonth(input.targetMonth);

  // 対象 tenant 一覧取得（system tx）
  const tenants = await withSystemTx(async (tx) => {
    return repo.findActiveTenantsForBatch(tx);
  });

  const results: GenerateMonthlyInvoicesResult[] = [];
  const errors: { tenantId: number; error: string }[] = [];

  // tenant ごとに逐次処理
  for (const tenant of tenants) {
    try {
      const result = await generateMonthlyInvoicesForTenant(ctx, {
        ...input,
        tenantId: tenant.id,
      });
      results.push(result);

      logger.info("Monthly billing completed for tenant", {
        tenantId: tenant.id,
        targetMonth: input.targetMonth,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({ tenantId: tenant.id, error: errorMessage });

      logger.error("Monthly billing failed for tenant", err instanceof Error ? err : undefined, {
        tenantId: tenant.id,
        targetMonth: input.targetMonth,
      });
    }
  }

  return {
    targetMonth: input.targetMonth,
    totalTenants: tenants.length,
    successCount: results.length,
    failedCount: errors.length,
    results,
    errors,
  };
}
