import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser } from "@/auth/session";
import { unauthorizedResponse } from "@/lib/session";
import { resolveRemainingCount } from "@/lib/contract-utils";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/contracts/:id — 詳細取得
export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const contract = await prisma.leaseContract.findFirst({
    where: { id: contractId, tenantId: user.tenantId },
    include: {
      customer: { select: { id: true, companyName: true, isDeleted: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!contract) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "契約が見つかりません" } },
      { status: 404 }
    );
  }

  const calc = resolveRemainingCount({
    contractStartDate: contract.contractStartDate,
    contractMonths: contract.contractMonths,
    billingBaseDay: contract.billingBaseDay,
    manualOverrideRemainingCount: contract.manualOverrideRemainingCount,
  });

  return NextResponse.json({
    data: {
      ...contract,
      monthlyFee: contract.monthlyFee ? Number(contract.monthlyFee) : null,
      counterBaseFee: contract.counterBaseFee != null ? Number(contract.counterBaseFee) : null,
      monoCounterRate: contract.monoCounterRate != null ? Number(contract.monoCounterRate) : null,
      colorCounterRate: contract.colorCounterRate != null ? Number(contract.colorCounterRate) : null,
      remainingCount: calc.remainingCount,
      elapsedCount: calc.elapsedCount,
      calculatedStatus: calc.contractStatus,
      expectedEndDate: calc.expectedEndDate,
      overrideApplied: calc.overrideApplied,
    },
  });
}

// PUT /api/contracts/:id — 更新
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const existing = await prisma.leaseContract.findFirst({
    where: { id: contractId, tenantId: user.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "契約が見つかりません" } },
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

  // バリデーション
  if (body.productName !== undefined && !String(body.productName).trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "商品名は必須です" } },
      { status: 400 }
    );
  }

  if (body.billingBaseDay !== undefined && body.billingBaseDay !== null) {
    const day = Number(body.billingBaseDay);
    if (day < 1 || day > 28) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "更新基準日は1〜28の範囲で入力してください" } },
        { status: 400 }
      );
    }
  }

  for (const [field, label] of [
    ["counterBaseFee", "カウンター基本料金"],
    ["monoCounterRate", "モノクロカウンター料金"],
    ["colorCounterRate", "カラーカウンター料金"],
  ] as const) {
    if (body[field] !== undefined && body[field] !== null) {
      const val = Number(body[field]);
      if (isNaN(val) || val < 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: `${label}は0以上で入力してください` } },
          { status: 400 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (body.contractNumber !== undefined) updateData.contractNumber = body.contractNumber ? String(body.contractNumber).trim() : null;
  if (body.productName !== undefined) updateData.productName = String(body.productName).trim();
  if (body.leaseCompanyName !== undefined) updateData.leaseCompanyName = body.leaseCompanyName ? String(body.leaseCompanyName).trim() : null;
  if (body.contractStartDate !== undefined) updateData.contractStartDate = new Date(String(body.contractStartDate));
  if (body.contractEndDate !== undefined) updateData.contractEndDate = new Date(String(body.contractEndDate));
  if (body.contractMonths !== undefined) updateData.contractMonths = Number(body.contractMonths);
  if (body.monthlyFee !== undefined) updateData.monthlyFee = body.monthlyFee != null ? Number(body.monthlyFee) : null;
  if (body.counterBaseFee !== undefined) updateData.counterBaseFee = body.counterBaseFee != null ? Number(body.counterBaseFee) : null;
  if (body.monoCounterRate !== undefined) updateData.monoCounterRate = body.monoCounterRate != null ? Number(body.monoCounterRate) : null;
  if (body.colorCounterRate !== undefined) updateData.colorCounterRate = body.colorCounterRate != null ? Number(body.colorCounterRate) : null;
  if (body.billingBaseDay !== undefined) updateData.billingBaseDay = body.billingBaseDay ? Number(body.billingBaseDay) : null;
  if (body.contractStatus !== undefined) updateData.contractStatus = String(body.contractStatus);
  if (body.manualOverrideRemainingCount !== undefined) {
    updateData.manualOverrideRemainingCount = body.manualOverrideRemainingCount !== null
      ? Number(body.manualOverrideRemainingCount) : null;
  }
  if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes).trim() : null;

  // ステータス再計算（手動ステータス変更がない場合）
  if (body.contractStatus === undefined) {
    const startDate = (updateData.contractStartDate ?? existing.contractStartDate) as Date;
    const months = (updateData.contractMonths ?? existing.contractMonths) as number;
    const baseDay = (updateData.billingBaseDay !== undefined ? updateData.billingBaseDay : existing.billingBaseDay) as number | null;
    const override = (updateData.manualOverrideRemainingCount !== undefined
      ? updateData.manualOverrideRemainingCount
      : existing.manualOverrideRemainingCount) as number | null;
    const calc = resolveRemainingCount({
      contractStartDate: startDate,
      contractMonths: months,
      billingBaseDay: baseDay,
      manualOverrideRemainingCount: override,
    });
    updateData.contractStatus = calc.contractStatus;
    updateData.remainingCountCached = calc.remainingCount;
  }

  const updated = await prisma.leaseContract.update({
    where: { id: contractId },
    data: updateData,
  });

  await writeAuditLog({
    userId: user.id,
    action: "update",
    tableName: "lease_contracts",
    recordId: contractId,
    oldValues: {
      productName: existing.productName,
      contractStatus: existing.contractStatus,
      contractMonths: existing.contractMonths,
    },
    newValues: updateData,
  });

  return NextResponse.json({ data: updated });
}

// DELETE /api/contracts/:id — 削除
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const contractId = Number(id);
  if (isNaN(contractId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
      { status: 400 }
    );
  }

  const existing = await prisma.leaseContract.findFirst({
    where: { id: contractId, tenantId: user.tenantId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "契約が見つかりません" } },
      { status: 404 }
    );
  }

  await prisma.leaseContract.delete({ where: { id: contractId } });

  await writeAuditLog({
    userId: user.id,
    action: "delete",
    tableName: "lease_contracts",
    recordId: contractId,
    oldValues: {
      productName: existing.productName,
      customerId: existing.customerId,
      contractNumber: existing.contractNumber,
    },
  });

  return NextResponse.json({ data: { message: "契約を削除しました" } });
}
