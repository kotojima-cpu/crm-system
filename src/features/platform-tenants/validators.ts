/**
 * Platform Tenant 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { TenantId } from "@/shared/types";
import { toTenantId } from "@/shared/types/helpers";
import type { SuspendTenantInput } from "./types";

const MAX_REASON_LENGTH = 1000;

/** tenantId パラメータの検証 */
export function validateTenantIdParam(value: string): TenantId {
  const num = Number(value);
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
    throw new ValidationError("テナントIDが不正です");
  }
  return toTenantId(num);
}

/** 停止予約入力の検証 */
export function validateSuspendTenantInput(input: unknown): SuspendTenantInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // reason — 必須
  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
    errors.push({ field: "reason", message: "停止理由は必須です" });
  } else if (body.reason.length > MAX_REASON_LENGTH) {
    errors.push({
      field: "reason",
      message: `停止理由は${MAX_REASON_LENGTH}文字以内で入力してください`,
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    reason: (body.reason as string).trim(),
  };
}
