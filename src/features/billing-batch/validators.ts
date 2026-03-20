/**
 * 月次請求バッチ 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { GenerateMonthlyInvoicesInput } from "./types";

const TARGET_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 対象月の形式を検証 */
export function validateTargetMonth(value: string): string {
  if (!TARGET_MONTH_PATTERN.test(value)) {
    throw new ValidationError(
      "targetMonth は YYYY-MM 形式で指定してください（例: 2026-04）",
    );
  }
  return value;
}

/** 月次請求生成入力の検証 */
export function validateGenerateMonthlyInvoicesInput(
  input: unknown,
): GenerateMonthlyInvoicesInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;

  if (!body.targetMonth || typeof body.targetMonth !== "string") {
    throw new ValidationError("targetMonth は必須です");
  }

  validateTargetMonth(body.targetMonth);

  if (body.tenantId !== undefined && body.tenantId !== null) {
    if (typeof body.tenantId !== "number" || body.tenantId <= 0) {
      throw new ValidationError("tenantId は正の整数で指定してください");
    }
  }

  return {
    targetMonth: body.targetMonth,
    tenantId: (body.tenantId as number) ?? null,
    dryRun: body.dryRun === true,
  };
}
