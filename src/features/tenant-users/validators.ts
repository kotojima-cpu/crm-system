/**
 * Tenant User 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { CreateInvitationInput } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_INVITE_ROLES = ["tenant_admin", "sales"] as const;

/** 招待予約入力の検証 */
export function validateCreateInvitationInput(input: unknown): CreateInvitationInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // email — 必須 + 形式チェック
  if (!body.email || typeof body.email !== "string" || body.email.trim().length === 0) {
    errors.push({ field: "email", message: "メールアドレスは必須です" });
  } else if (!EMAIL_REGEX.test(body.email.trim())) {
    errors.push({ field: "email", message: "メールアドレスの形式が不正です" });
  }

  // role — tenant ロールのみ許可（platform_admin 招待禁止）
  if (!body.role || typeof body.role !== "string") {
    errors.push({ field: "role", message: "ロールは必須です" });
  } else if (!(ALLOWED_INVITE_ROLES as readonly string[]).includes(body.role)) {
    errors.push({
      field: "role",
      message: "ロールは tenant_admin または sales のみ指定できます",
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    email: (body.email as string).trim().toLowerCase(),
    role: body.role as "tenant_admin" | "sales",
  };
}
