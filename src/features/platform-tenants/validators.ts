/**
 * Platform Tenant 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { TenantId } from "@/shared/types";
import { toTenantId } from "@/shared/types/helpers";
import type { CreateTenantInput, UpdateTenantContractorInput, SuspendTenantInput, ResumeTenantInput } from "./types";

import { PREFECTURES } from "@/lib/prefectures";

const MAX_TENANT_NAME_LENGTH = 100;
const MAX_NAME_LENGTH = 100;
const MAX_LOGIN_ID_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_REASON_LENGTH = 1000;

/** tenantId パラメータの検証 */
export function validateTenantIdParam(value: string): TenantId {
  const num = Number(value);
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
    throw new ValidationError("テナントIDが不正です");
  }
  return toTenantId(num);
}

/** テナント新規作成入力の検証 */
export function validateCreateTenantInput(input: unknown): CreateTenantInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  // tenantName
  if (!body.tenantName || typeof body.tenantName !== "string" || body.tenantName.trim().length === 0) {
    errors.push({ field: "tenantName", message: "テナント名は必須です" });
  } else if (body.tenantName.trim().length > MAX_TENANT_NAME_LENGTH) {
    errors.push({ field: "tenantName", message: `テナント名は${MAX_TENANT_NAME_LENGTH}文字以内で入力してください` });
  }

  // adminName
  if (!body.adminName || typeof body.adminName !== "string" || body.adminName.trim().length === 0) {
    errors.push({ field: "adminName", message: "管理者名は必須です" });
  } else if (body.adminName.trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: "adminName", message: `管理者名は${MAX_NAME_LENGTH}文字以内で入力してください` });
  }

  // adminLoginId
  if (!body.adminLoginId || typeof body.adminLoginId !== "string" || body.adminLoginId.trim().length === 0) {
    errors.push({ field: "adminLoginId", message: "ログインIDは必須です" });
  } else if (body.adminLoginId.trim().length > MAX_LOGIN_ID_LENGTH) {
    errors.push({ field: "adminLoginId", message: `ログインIDは${MAX_LOGIN_ID_LENGTH}文字以内で入力してください` });
  } else if (!/^[a-zA-Z0-9_-]+$/.test(body.adminLoginId.trim())) {
    errors.push({ field: "adminLoginId", message: "ログインIDは半角英数字・ハイフン・アンダースコアのみ使用できます" });
  }

  // adminPassword
  if (!body.adminPassword || typeof body.adminPassword !== "string") {
    errors.push({ field: "adminPassword", message: "パスワードは必須です" });
  } else if (body.adminPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push({ field: "adminPassword", message: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` });
  } else if (body.adminPassword.length > MAX_PASSWORD_LENGTH) {
    errors.push({ field: "adminPassword", message: `パスワードは${MAX_PASSWORD_LENGTH}文字以内で入力してください` });
  }

  // 住所（都道府県）— 必須
  if (!body.prefecture || typeof body.prefecture !== "string" || body.prefecture.trim().length === 0) {
    errors.push({ field: "prefecture", message: "都道府県は必須です" });
  } else if (!PREFECTURES.includes(body.prefecture.trim() as typeof PREFECTURES[number])) {
    errors.push({ field: "prefecture", message: "都道府県が不正です" });
  }

  // メールアドレス — 必須
  if (!body.contactEmail || typeof body.contactEmail !== "string" || body.contactEmail.trim().length === 0) {
    errors.push({ field: "contactEmail", message: "メールアドレスは必須です" });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail.trim())) {
    errors.push({ field: "contactEmail", message: "メールアドレスの形式が不正です" });
  }

  // TEL — 必須
  if (!body.contactPhone || typeof body.contactPhone !== "string" || body.contactPhone.trim().length === 0) {
    errors.push({ field: "contactPhone", message: "TELは必須です" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  // 携帯番号（任意）
  const contactMobile = body.contactMobile && typeof body.contactMobile === "string" && body.contactMobile.trim().length > 0
    ? body.contactMobile.trim()
    : undefined;

  return {
    tenantName: (body.tenantName as string).trim(),
    adminName: (body.adminName as string).trim(),
    adminLoginId: (body.adminLoginId as string).trim(),
    adminPassword: body.adminPassword as string,
    prefecture: (body.prefecture as string).trim(),
    contactEmail: (body.contactEmail as string).trim(),
    contactPhone: (body.contactPhone as string).trim(),
    contactMobile,
  };
}

/** 契約者情報フィールドの抽出・検証（共通） */
function extractContractorFields(
  body: Record<string, unknown>,
  errors: { field: string; message: string }[],
): Partial<UpdateTenantContractorInput> {
  const result: Partial<UpdateTenantContractorInput> = {};

  if (body.contractorName !== undefined && body.contractorName !== "") {
    result.contractorName = String(body.contractorName).trim();
  }
  // contactPerson（管理者氏名）は更新不可 — テナント作成時の値を維持するため除外
  if (body.contactEmail !== undefined && body.contactEmail !== "") {
    const email = String(body.contactEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: "contactEmail", message: "メールアドレスの形式が不正です" });
    } else {
      result.contactEmail = email;
    }
  }
  if (body.contactPhone !== undefined && body.contactPhone !== "") {
    result.contactPhone = String(body.contactPhone).trim();
  }
  if (body.contactMobile !== undefined && body.contactMobile !== "") {
    result.contactMobile = String(body.contactMobile).trim();
  }
  if (body.prefecture !== undefined && body.prefecture !== "") {
    const pref = String(body.prefecture).trim();
    if (!PREFECTURES.includes(pref as typeof PREFECTURES[number])) {
      errors.push({ field: "prefecture", message: "都道府県が不正です" });
    } else {
      result.prefecture = pref;
    }
  }

  return result;
}

/** 契約者情報更新入力の検証 */
export function validateUpdateContractorInput(input: unknown): UpdateTenantContractorInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];
  const result = extractContractorFields(body, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return result;
}

/** 再開入力の検証 */
export function validateResumeTenantInput(input: unknown): ResumeTenantInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: { field: string; message: string }[] = [];

  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
    errors.push({ field: "reason", message: "再開理由は必須です" });
  } else if (body.reason.length > MAX_REASON_LENGTH) {
    errors.push({ field: "reason", message: `再開理由は${MAX_REASON_LENGTH}文字以内で入力してください` });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return { reason: (body.reason as string).trim() };
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
