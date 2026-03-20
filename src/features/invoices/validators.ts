/**
 * Invoice 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { CreateInvoiceInput, CancelInvoiceInput } from "./types";

const MAX_CANCEL_REASON = 1000;

/** 請求作成入力の検証 */
export function validateCreateInvoiceInput(input: unknown): CreateInvoiceInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // contractId — 必須
  if (!body.contractId || typeof body.contractId !== "number" || body.contractId <= 0) {
    errors.push({ field: "contractId", message: "契約IDは必須です" });
  }

  // periodStart — 必須
  if (!body.periodStart || typeof body.periodStart !== "string") {
    errors.push({ field: "periodStart", message: "対象期間開始日は必須です" });
  } else if (isNaN(Date.parse(body.periodStart))) {
    errors.push({ field: "periodStart", message: "対象期間開始日の形式が不正です" });
  }

  // periodEnd — 必須
  if (!body.periodEnd || typeof body.periodEnd !== "string") {
    errors.push({ field: "periodEnd", message: "対象期間終了日は必須です" });
  } else if (isNaN(Date.parse(body.periodEnd))) {
    errors.push({ field: "periodEnd", message: "対象期間終了日の形式が不正です" });
  }

  // periodStart < periodEnd
  if (body.periodStart && body.periodEnd) {
    const start = new Date(body.periodStart as string);
    const end = new Date(body.periodEnd as string);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end) {
      errors.push({ field: "periodEnd", message: "対象期間終了日は開始日より後にしてください" });
    }
  }

  // amount — 必須・非負
  if (body.amount === undefined || body.amount === null || typeof body.amount !== "number") {
    errors.push({ field: "amount", message: "請求金額は必須です" });
  } else if (body.amount < 0) {
    errors.push({ field: "amount", message: "請求金額は0以上で入力してください" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    contractId: body.contractId as number,
    periodStart: body.periodStart as string,
    periodEnd: body.periodEnd as string,
    amount: body.amount as number,
  };
}

/** 請求キャンセル入力の検証 */
export function validateCancelInvoiceInput(input: unknown): CancelInvoiceInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;

  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
    throw new ValidationError("キャンセル理由は必須です");
  }
  if (body.reason.length > MAX_CANCEL_REASON) {
    throw new ValidationError(`キャンセル理由は${MAX_CANCEL_REASON}文字以内で入力してください`);
  }

  return { reason: (body.reason as string).trim() };
}
