/**
 * Customer 入力検証
 */

import { ValidationError } from "@/shared/errors";
import type { CreateCustomerInput, UpdateCustomerInput } from "./types";

const MAX_COMPANY_NAME = 200;
const MAX_GENERAL_FIELD = 500;
const MAX_NOTES = 2000;

interface FieldError {
  field: string;
  message: string;
}

function validateStringLength(
  value: string | null | undefined,
  field: string,
  label: string,
  max: number,
  errors: FieldError[],
): void {
  if (value && value.length > max) {
    errors.push({ field, message: `${label}は${max}文字以内で入力してください` });
  }
}

/** 顧客作成入力の検証 */
export function validateCreateCustomerInput(input: unknown): CreateCustomerInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];

  // companyName — 必須
  if (
    !body.companyName ||
    typeof body.companyName !== "string" ||
    body.companyName.trim().length === 0
  ) {
    errors.push({ field: "companyName", message: "会社名は必須です" });
  } else if (body.companyName.length > MAX_COMPANY_NAME) {
    errors.push({
      field: "companyName",
      message: `会社名は${MAX_COMPANY_NAME}文字以内で入力してください`,
    });
  }

  // 任意フィールドの長さチェック
  validateStringLength(
    body.companyNameKana as string | null,
    "companyNameKana", "会社名カナ", MAX_COMPANY_NAME, errors,
  );
  validateStringLength(body.address as string | null, "address", "住所", MAX_GENERAL_FIELD, errors);
  validateStringLength(body.notes as string | null, "notes", "備考", MAX_NOTES, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  return {
    companyName: (body.companyName as string).trim(),
    companyNameKana: trimOrNull(body.companyNameKana),
    zipCode: trimOrNull(body.zipCode),
    address: trimOrNull(body.address),
    phone: trimOrNull(body.phone),
    fax: trimOrNull(body.fax),
    contactName: trimOrNull(body.contactName),
    contactPhone: trimOrNull(body.contactPhone),
    contactEmail: trimOrNull(body.contactEmail),
    notes: trimOrNull(body.notes),
  };
}

/** 顧客更新入力の検証 */
export function validateUpdateCustomerInput(input: unknown): UpdateCustomerInput {
  if (!input || typeof input !== "object") {
    throw new ValidationError("リクエストが不正です");
  }

  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];

  // companyName — 指定された場合は空不可
  if (body.companyName !== undefined) {
    if (
      typeof body.companyName !== "string" ||
      body.companyName.trim().length === 0
    ) {
      errors.push({ field: "companyName", message: "会社名は必須です" });
    } else if (body.companyName.length > MAX_COMPANY_NAME) {
      errors.push({
        field: "companyName",
        message: `会社名は${MAX_COMPANY_NAME}文字以内で入力してください`,
      });
    }
  }

  validateStringLength(
    body.companyNameKana as string | null,
    "companyNameKana", "会社名カナ", MAX_COMPANY_NAME, errors,
  );
  validateStringLength(body.address as string | null, "address", "住所", MAX_GENERAL_FIELD, errors);
  validateStringLength(body.notes as string | null, "notes", "備考", MAX_NOTES, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, errors);
  }

  const result: UpdateCustomerInput = {};

  if (body.companyName !== undefined) result.companyName = (body.companyName as string).trim();
  if (body.companyNameKana !== undefined) result.companyNameKana = trimOrNull(body.companyNameKana);
  if (body.zipCode !== undefined) result.zipCode = trimOrNull(body.zipCode);
  if (body.address !== undefined) result.address = trimOrNull(body.address);
  if (body.phone !== undefined) result.phone = trimOrNull(body.phone);
  if (body.fax !== undefined) result.fax = trimOrNull(body.fax);
  if (body.contactName !== undefined) result.contactName = trimOrNull(body.contactName);
  if (body.contactPhone !== undefined) result.contactPhone = trimOrNull(body.contactPhone);
  if (body.contactEmail !== undefined) result.contactEmail = trimOrNull(body.contactEmail);
  if (body.notes !== undefined) result.notes = trimOrNull(body.notes);

  return result;
}

function trimOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}
