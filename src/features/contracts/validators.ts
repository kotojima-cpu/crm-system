/**
 * Contract 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { CreateContractInput, UpdateContractInput } from "./types";

const MAX_NAME = 200;
const MAX_NOTES = 2000;
const VALID_STATUSES = ["active", "expiring_soon", "expired", "cancelled"];

/** 契約作成入力の検証 */
export function validateCreateContractInput(input: unknown): CreateContractInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // customerId — 必須
  if (!body.customerId || typeof body.customerId !== "number" || body.customerId <= 0) {
    errors.push({ field: "customerId", message: "顧客IDは必須です" });
  }

  // productName — 必須
  if (!body.productName || typeof body.productName !== "string" || body.productName.trim().length === 0) {
    errors.push({ field: "productName", message: "製品名は必須です" });
  } else if (body.productName.length > MAX_NAME) {
    errors.push({ field: "productName", message: `製品名は${MAX_NAME}文字以内で入力してください` });
  }

  // contractStartDate — 必須
  if (!body.contractStartDate || typeof body.contractStartDate !== "string") {
    errors.push({ field: "contractStartDate", message: "契約開始日は必須です" });
  } else if (isNaN(Date.parse(body.contractStartDate))) {
    errors.push({ field: "contractStartDate", message: "契約開始日の形式が不正です" });
  }

  // contractEndDate — 必須
  if (!body.contractEndDate || typeof body.contractEndDate !== "string") {
    errors.push({ field: "contractEndDate", message: "契約終了日は必須です" });
  } else if (isNaN(Date.parse(body.contractEndDate))) {
    errors.push({ field: "contractEndDate", message: "契約終了日の形式が不正です" });
  }

  // contractMonths — 必須・正の整数
  if (!body.contractMonths || typeof body.contractMonths !== "number" || body.contractMonths <= 0) {
    errors.push({ field: "contractMonths", message: "契約月数は正の整数で入力してください" });
  }

  // monthlyFee — 任意・非負
  if (body.monthlyFee !== undefined && body.monthlyFee !== null) {
    if (typeof body.monthlyFee !== "number" || body.monthlyFee < 0) {
      errors.push({ field: "monthlyFee", message: "月額は0以上で入力してください" });
    }
  }

  // billingBaseDay — 任意・1〜28
  if (body.billingBaseDay !== undefined && body.billingBaseDay !== null) {
    if (typeof body.billingBaseDay !== "number" || body.billingBaseDay < 1 || body.billingBaseDay > 28) {
      errors.push({ field: "billingBaseDay", message: "請求基準日は1〜28で入力してください" });
    }
  }

  // notes
  if (body.notes && typeof body.notes === "string" && body.notes.length > MAX_NOTES) {
    errors.push({ field: "notes", message: `備考は${MAX_NOTES}文字以内で入力してください` });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    customerId: body.customerId as number,
    contractNumber: trimOrNull(body.contractNumber),
    productName: (body.productName as string).trim(),
    leaseCompanyName: trimOrNull(body.leaseCompanyName),
    contractStartDate: body.contractStartDate as string,
    contractEndDate: body.contractEndDate as string,
    contractMonths: body.contractMonths as number,
    monthlyFee: (body.monthlyFee as number) ?? null,
    counterBaseFee: (body.counterBaseFee as number) ?? null,
    monoCounterRate: (body.monoCounterRate as number) ?? null,
    colorCounterRate: (body.colorCounterRate as number) ?? null,
    billingBaseDay: (body.billingBaseDay as number) ?? null,
    notes: trimOrNull(body.notes),
  };
}

/** 契約更新入力の検証 */
export function validateUpdateContractInput(input: unknown): UpdateContractInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  if (body.productName !== undefined) {
    if (typeof body.productName !== "string" || body.productName.trim().length === 0) {
      errors.push({ field: "productName", message: "製品名は必須です" });
    } else if (body.productName.length > MAX_NAME) {
      errors.push({ field: "productName", message: `製品名は${MAX_NAME}文字以内で入力してください` });
    }
  }

  if (body.contractStatus !== undefined) {
    if (!VALID_STATUSES.includes(body.contractStatus as string)) {
      errors.push({ field: "contractStatus", message: "契約ステータスが不正です" });
    }
  }

  if (body.billingBaseDay !== undefined && body.billingBaseDay !== null) {
    if (typeof body.billingBaseDay !== "number" || body.billingBaseDay < 1 || body.billingBaseDay > 28) {
      errors.push({ field: "billingBaseDay", message: "請求基準日は1〜28で入力してください" });
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  const result: UpdateContractInput = {};
  if (body.contractNumber !== undefined) result.contractNumber = trimOrNull(body.contractNumber);
  if (body.productName !== undefined) result.productName = (body.productName as string).trim();
  if (body.leaseCompanyName !== undefined) result.leaseCompanyName = trimOrNull(body.leaseCompanyName);
  if (body.monthlyFee !== undefined) result.monthlyFee = (body.monthlyFee as number) ?? null;
  if (body.counterBaseFee !== undefined) result.counterBaseFee = (body.counterBaseFee as number) ?? null;
  if (body.monoCounterRate !== undefined) result.monoCounterRate = (body.monoCounterRate as number) ?? null;
  if (body.colorCounterRate !== undefined) result.colorCounterRate = (body.colorCounterRate as number) ?? null;
  if (body.billingBaseDay !== undefined) result.billingBaseDay = (body.billingBaseDay as number) ?? null;
  if (body.contractStatus !== undefined) result.contractStatus = body.contractStatus as string;
  if (body.notes !== undefined) result.notes = trimOrNull(body.notes);

  return result;
}

function trimOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}
