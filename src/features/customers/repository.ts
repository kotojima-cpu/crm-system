/**
 * Customer Repository
 *
 * Prisma の薄いラッパ。
 * tenant スコープのクエリ責務を集約する。
 * TxClient を明示的に受け取り、RequestContext を直接読まない。
 */

import type { TxClient } from "@/shared/db";
import type { TenantId, ActorUserId } from "@/shared/types";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerSummary,
  CustomerDetail,
} from "./types";
import { normalizePhone } from "@/lib/phone";

/** tenant スコープで顧客一覧を取得 */
export async function findManyByTenant(
  tx: TxClient,
  tenantId: TenantId,
  options: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  },
): Promise<{ data: CustomerSummary[]; total: number }> {
  const { page, limit, search, sortBy = "updatedAt", sortOrder = "desc" } = options;

  const where: Record<string, unknown> = {
    tenantId: tenantId as number,
    isDeleted: false,
  };

  if (search) {
    (where as Record<string, unknown>).OR = [
      { companyName: { contains: search } },
      { contactName: { contains: search } },
    ];
  }

  const allowedSortKeys: Record<string, string> = {
    companyName: "companyName",
    companyNameKana: "companyNameKana",
    updatedAt: "updatedAt",
    createdAt: "createdAt",
  };
  const orderByField = allowedSortKeys[sortBy] || "updatedAt";

  const [data, total] = await Promise.all([
    tx.customer.findMany({
      where,
      orderBy: { [orderByField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        companyName: true,
        address: true,
        phone: true,
        contactName: true,
        updatedAt: true,
      },
    }),
    tx.customer.count({ where }),
  ]);

  return { data, total };
}

/** tenant スコープで顧客を ID 取得 */
export async function findByIdAndTenant(
  tx: TxClient,
  customerId: number,
  tenantId: TenantId,
): Promise<CustomerDetail | null> {
  return tx.customer.findFirst({
    where: {
      id: customerId,
      tenantId: tenantId as number,
      isDeleted: false,
    },
  });
}

/** tenant スコープで顧客を作成 */
export async function createForTenant(
  tx: TxClient,
  tenantId: TenantId,
  actorUserId: ActorUserId,
  input: CreateCustomerInput,
): Promise<CustomerDetail> {
  return tx.customer.create({
    data: {
      tenantId: tenantId as number,
      companyName: input.companyName,
      companyNameKana: input.companyNameKana ?? null,
      zipCode: input.zipCode ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      phoneNumberNormalized: input.phone ? normalizePhone(input.phone) : null,
      fax: input.fax ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      notes: input.notes ?? null,
      createdBy: actorUserId as number,
    },
  });
}

/** tenant スコープで顧客を更新 */
export async function updateForTenant(
  tx: TxClient,
  customerId: number,
  tenantId: TenantId,
  input: UpdateCustomerInput,
): Promise<CustomerDetail> {
  const updateData: Record<string, unknown> = {};

  if (input.companyName !== undefined) updateData.companyName = input.companyName;
  if (input.companyNameKana !== undefined) updateData.companyNameKana = input.companyNameKana;
  if (input.zipCode !== undefined) updateData.zipCode = input.zipCode;
  if (input.address !== undefined) updateData.address = input.address;
  if (input.phone !== undefined) {
    updateData.phone = input.phone;
    updateData.phoneNumberNormalized = input.phone ? normalizePhone(input.phone) : null;
  }
  if (input.fax !== undefined) updateData.fax = input.fax;
  if (input.contactName !== undefined) updateData.contactName = input.contactName;
  if (input.contactPhone !== undefined) updateData.contactPhone = input.contactPhone;
  if (input.contactEmail !== undefined) updateData.contactEmail = input.contactEmail;
  if (input.notes !== undefined) updateData.notes = input.notes;

  return tx.customer.update({
    where: { id: customerId },
    data: updateData,
  });
}
