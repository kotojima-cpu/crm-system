/**
 * Tenant User 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { CreateInvitationInput, CreateTenantUserInput } from "./types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_INVITE_ROLES = ["tenant_admin", "sales"] as const;
const ALLOWED_CREATE_ROLES = ["tenant_admin", "sales"] as const;
const MAX_LOGIN_ID_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 100;

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

/** ユーザー直接作成入力の検証 */
export function validateCreateTenantUserInput(input: unknown): CreateTenantUserInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // loginId
  if (!body.loginId || typeof body.loginId !== "string" || body.loginId.trim().length === 0) {
    errors.push({ field: "loginId", message: "ログインIDは必須です" });
  } else if (body.loginId.trim().length > MAX_LOGIN_ID_LENGTH) {
    errors.push({ field: "loginId", message: `ログインIDは${MAX_LOGIN_ID_LENGTH}文字以内で入力してください` });
  } else if (!/^[a-zA-Z0-9_-]+$/.test(body.loginId.trim())) {
    errors.push({ field: "loginId", message: "ログインIDは半角英数字・ハイフン・アンダースコアのみ使用できます" });
  }

  // password
  if (!body.password || typeof body.password !== "string") {
    errors.push({ field: "password", message: "パスワードは必須です" });
  } else if (body.password.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: "password", message: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` });
  } else if (body.password.length > MAX_PASSWORD_LENGTH) {
    errors.push({ field: "password", message: `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください` });
  }

  // name
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    errors.push({ field: "name", message: "名前は必須です" });
  } else if (body.name.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: "name", message: `名前は${MAX_NAME_LENGTH}文字以内で入力してください` });
  }

  // email
  if (!body.email || typeof body.email !== "string" || body.email.trim().length === 0) {
    errors.push({ field: "email", message: "メールアドレスは必須です" });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push({ field: "email", message: "メールアドレスの形式が不正です" });
  }

  // role
  if (!body.role || typeof body.role !== "string") {
    errors.push({ field: "role", message: "権限は必須です" });
  } else if (!(ALLOWED_CREATE_ROLES as readonly string[]).includes(body.role)) {
    errors.push({ field: "role", message: "権限は tenant_admin または sales のみ指定できます" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    loginId: (body.loginId as string).trim(),
    password: body.password as string,
    name: (body.name as string).trim(),
    email: (body.email as string).trim().toLowerCase(),
    role: body.role as "tenant_admin" | "sales",
  };
}
