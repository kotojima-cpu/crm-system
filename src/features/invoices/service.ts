/**
 * Invoice Service
 *
 * 請求の基本 CRUD と安全な状態遷移。
 * 冪等性方針: 同一契約・同一期間で draft/confirmed が存在 → 既存を返す（idempotent success）
 */

import { withTenantTx } from "@/shared/db";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { writeAuditLog } from "@/audit";
import { writeOutboxEvent } from "@/outbox";
import type {
  ListInvoicesInput,
  ListInvoicesResult,
  CreateInvoiceInput,
  CancelInvoiceInput,
  InvoiceDetail,
  InvoiceServiceContext,
} from "./types";
import * as repo from "./repository";
import {
  buildInvoiceCreatedAudit,
  buildInvoiceConfirmedAudit,
  buildInvoiceCancelledAudit,
} from "./audit";
import {
  buildInvoiceCreatedOutbox,
  buildInvoiceConfirmedOutbox,
  buildInvoiceCancelledOutbox,
} from "./outbox";

/** 請求一覧取得 */
export async function listInvoices(
  ctx: InvoiceServiceContext,
  input: ListInvoicesInput,
): Promise<ListInvoicesResult> {
  const { data, total } = await withTenantTx(ctx.tenantId, async (tx) => {
    return repo.findManyByTenant(tx, ctx.tenantId, {
      page: input.page,
      limit: input.limit,
      contractId: input.contractId,
      status: input.status,
    });
  });

  return {
    data,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

/** 請求詳細取得 */
export async function getInvoiceById(
  ctx: InvoiceServiceContext,
  invoiceId: number,
): Promise<InvoiceDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const invoice = await repo.findByIdAndTenant(tx, invoiceId, ctx.tenantId);
    if (!invoice) {
      throw new NotFoundError("請求");
    }
    return invoice;
  });
}

/**
 * 請求作成予約
 *
 * 冪等性: 同一 contract・同一期間で draft/confirmed が存在 → 既存を返す
 */
export async function createInvoice(
  ctx: InvoiceServiceContext,
  input: CreateInvoiceInput,
): Promise<{ invoice: InvoiceDetail; created: boolean }> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    // 契約の tenant 整合チェック
    const contract = await repo.findContractByIdAndTenant(
      tx,
      input.contractId,
      ctx.tenantId,
    );
    if (!contract) {
      throw new ValidationError("指定された契約が見つかりません");
    }

    // 重複チェック（冪等性）
    const existing = await repo.findExistingInvoiceForPeriod(
      tx,
      ctx.tenantId,
      input.contractId,
      new Date(input.periodStart),
      new Date(input.periodEnd),
    );
    if (existing) {
      return { invoice: existing, created: false };
    }

    // 新規作成
    const invoice = await repo.createForTenant(
      tx,
      ctx.tenantId,
      ctx.actorUserId,
      input,
      contract.customerId,
    );

    await writeAuditLog(tx, buildInvoiceCreatedAudit(invoice, ctx.tenantId));
    await writeOutboxEvent(tx, buildInvoiceCreatedOutbox(invoice, ctx.tenantId));

    return { invoice, created: true };
  });
}

/**
 * 請求確定
 *
 * 冪等性: すでに confirmed → そのまま返す
 */
export async function confirmInvoice(
  ctx: InvoiceServiceContext,
  invoiceId: number,
): Promise<InvoiceDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const existing = await repo.findByIdAndTenant(tx, invoiceId, ctx.tenantId);
    if (!existing) {
      throw new NotFoundError("請求");
    }

    // すでに confirmed → 冪等
    if (existing.status === "confirmed") {
      return existing;
    }

    // cancelled からの confirm は禁止
    if (existing.status === "cancelled") {
      throw new ValidationError("キャンセル済みの請求は確定できません");
    }

    const confirmed = await repo.markConfirmed(tx, invoiceId);

    await writeAuditLog(tx, buildInvoiceConfirmedAudit(confirmed, ctx.tenantId));
    await writeOutboxEvent(tx, buildInvoiceConfirmedOutbox(confirmed, ctx.tenantId));

    return confirmed;
  });
}

/**
 * 請求キャンセル
 *
 * 冪等性: すでに cancelled → そのまま返す
 */
export async function cancelInvoice(
  ctx: InvoiceServiceContext,
  invoiceId: number,
  input: CancelInvoiceInput,
): Promise<InvoiceDetail> {
  return withTenantTx(ctx.tenantId, async (tx) => {
    const existing = await repo.findByIdAndTenant(tx, invoiceId, ctx.tenantId);
    if (!existing) {
      throw new NotFoundError("請求");
    }

    // すでに cancelled → 冪等
    if (existing.status === "cancelled") {
      return existing;
    }

    const oldStatus = existing.status;
    const cancelled = await repo.markCancelled(tx, invoiceId, input.reason);

    await writeAuditLog(
      tx,
      buildInvoiceCancelledAudit(cancelled, oldStatus, ctx.tenantId),
    );
    await writeOutboxEvent(tx, buildInvoiceCancelledOutbox(cancelled, ctx.tenantId));

    return cancelled;
  });
}
