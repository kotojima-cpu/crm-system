import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser, unauthorizedResponse } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/customers/:id — 詳細取得
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const customerId = Number(id);
  if (isNaN(customerId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
    include: {
      creator: { select: { id: true, name: true } },
      leaseContracts: {
        select: {
          id: true,
          contractNumber: true,
          productName: true,
          contractStartDate: true,
          contractEndDate: true,
          contractMonths: true,
          contractStatus: true,
          monthlyFee: true,
        },
        orderBy: { contractStartDate: "desc" },
      },
    },
  });

  if (!customer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "顧客が見つかりません" } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: customer });
}

// PUT /api/customers/:id — 更新
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const customerId = Number(id);
  if (isNaN(customerId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "顧客が見つかりません" } },
      { status: 404 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "リクエストが不正です" } },
      { status: 400 }
    );
  }

  const { companyName, companyNameKana, zipCode, address, phone, fax, contactName, contactPhone, contactEmail, notes } = body as Record<string, string>;

  // バリデーション
  if (companyName !== undefined) {
    if (typeof companyName !== "string" || companyName.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "会社名は必須です" } },
        { status: 400 }
      );
    }
    if (companyName.length > 200) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "会社名は200文字以内で入力してください" } },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (companyName !== undefined) updateData.companyName = companyName.trim();
  if (companyNameKana !== undefined) updateData.companyNameKana = companyNameKana?.trim() || null;
  if (zipCode !== undefined) updateData.zipCode = zipCode?.trim() || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (phone !== undefined) {
    updateData.phone = phone?.trim() || null;
    updateData.phoneNumberNormalized = normalizePhone(phone);
  }
  if (fax !== undefined) updateData.fax = fax?.trim() || null;
  if (contactName !== undefined) updateData.contactName = contactName?.trim() || null;
  if (contactPhone !== undefined) updateData.contactPhone = contactPhone?.trim() || null;
  if (contactEmail !== undefined) updateData.contactEmail = contactEmail?.trim() || null;
  if (notes !== undefined) updateData.notes = notes?.trim() || null;

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: updateData,
  });

  await writeAuditLog({
    userId: user.id,
    action: "update",
    tableName: "customers",
    recordId: customerId,
    oldValues: {
      companyName: existing.companyName,
      phone: existing.phone,
      address: existing.address,
      contactName: existing.contactName,
    },
    newValues: updateData,
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/customers/:id — 論理削除
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const customerId = Number(id);
  if (isNaN(customerId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "顧客が見つかりません" } },
      { status: 404 }
    );
  }

  // 紐付く契約がある場合は警告（ただし論理削除なので実行は可能）
  const contractCount = await prisma.leaseContract.count({
    where: { customerId },
  });

  await prisma.customer.update({
    where: { id: customerId },
    data: { isDeleted: true },
  });

  await writeAuditLog({
    userId: user.id,
    action: "delete",
    tableName: "customers",
    recordId: customerId,
    oldValues: { companyName: existing.companyName, contractCount },
  });

  return NextResponse.json({
    data: { message: "顧客を削除しました" },
  });
}
