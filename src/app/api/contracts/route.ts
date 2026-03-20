import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser } from "@/auth/session";
import { unauthorizedResponse } from "@/lib/session";
import { resolveRemainingCount } from "@/lib/contract-utils";

// GET /api/contracts — 一覧取得
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
  const customerId = searchParams.get("customerId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (customerId) where.customerId = Number(customerId);
  if (status) where.contractStatus = status;

  const [contracts, total] = await Promise.all([
    prisma.leaseContract.findMany({
      where,
      orderBy: { contractStartDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { id: true, companyName: true } },
      },
    }),
    prisma.leaseContract.count({ where }),
  ]);

  const data = contracts.map((c) => {
    const calc = resolveRemainingCount({
      contractStartDate: c.contractStartDate,
      contractMonths: c.contractMonths,
      billingBaseDay: c.billingBaseDay,
      manualOverrideRemainingCount: c.manualOverrideRemainingCount,
    });
    return {
      ...c,
      monthlyFee: c.monthlyFee ? Number(c.monthlyFee) : null,
      counterBaseFee: c.counterBaseFee != null ? Number(c.counterBaseFee) : null,
      monoCounterRate: c.monoCounterRate != null ? Number(c.monoCounterRate) : null,
      colorCounterRate: c.colorCounterRate != null ? Number(c.colorCounterRate) : null,
      remainingCount: calc.remainingCount,
      elapsedCount: calc.elapsedCount,
      calculatedStatus: calc.contractStatus,
      expectedEndDate: calc.expectedEndDate,
      overrideApplied: calc.overrideApplied,
    };
  });

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

// POST /api/contracts — 新規登録
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();
  if (!user.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
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

  const errors: { field: string; message: string }[] = [];

  const customerId = Number(body.customerId);
  if (!customerId || isNaN(customerId)) {
    errors.push({ field: "customerId", message: "顧客IDは必須です" });
  }

  const productName = String(body.productName || "").trim();
  if (!productName) errors.push({ field: "productName", message: "商品名は必須です" });

  const contractStartDate = body.contractStartDate ? new Date(String(body.contractStartDate)) : null;
  if (!contractStartDate || isNaN(contractStartDate.getTime())) {
    errors.push({ field: "contractStartDate", message: "契約開始日は必須です" });
  }

  const contractEndDate = body.contractEndDate ? new Date(String(body.contractEndDate)) : null;
  if (!contractEndDate || isNaN(contractEndDate.getTime())) {
    errors.push({ field: "contractEndDate", message: "契約終了日は必須です" });
  }

  const contractMonths = Number(body.contractMonths);
  if (!contractMonths || contractMonths <= 0) {
    errors.push({ field: "contractMonths", message: "契約月数は1以上の整数で入力してください" });
  }

  if (contractStartDate && contractEndDate && contractStartDate >= contractEndDate) {
    errors.push({ field: "contractEndDate", message: "契約終了日は開始日より後にしてください" });
  }

  const billingBaseDay = body.billingBaseDay ? Number(body.billingBaseDay) : null;
  if (billingBaseDay !== null && (billingBaseDay < 1 || billingBaseDay > 28)) {
    errors.push({ field: "billingBaseDay", message: "更新基準日は1〜28の範囲で入力してください" });
  }

  const counterBaseFee = body.counterBaseFee != null ? Number(body.counterBaseFee) : null;
  if (counterBaseFee !== null && (isNaN(counterBaseFee) || counterBaseFee < 0)) {
    errors.push({ field: "counterBaseFee", message: "カウンター基本料金は0以上で入力してください" });
  }
  const monoCounterRate = body.monoCounterRate != null ? Number(body.monoCounterRate) : null;
  if (monoCounterRate !== null && (isNaN(monoCounterRate) || monoCounterRate < 0)) {
    errors.push({ field: "monoCounterRate", message: "モノクロカウンター料金は0以上で入力してください" });
  }
  const colorCounterRate = body.colorCounterRate != null ? Number(body.colorCounterRate) : null;
  if (colorCounterRate !== null && (isNaN(colorCounterRate) || colorCounterRate < 0)) {
    errors.push({ field: "colorCounterRate", message: "カラーカウンター料金は0以上で入力してください" });
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: errors[0].message, details: errors } },
      { status: 400 }
    );
  }

  // 顧客存在チェック（tenantId で自テナント顧客のみ許可）
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false, tenantId: user.tenantId },
  });
  if (!customer) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "顧客が見つかりません" } },
      { status: 404 }
    );
  }

  // 初期ステータスを計算（新規作成時は手動上書きなし）
  const calc = resolveRemainingCount({
    contractStartDate: contractStartDate!,
    contractMonths,
    billingBaseDay,
    manualOverrideRemainingCount: null,
  });

  const contract = await prisma.leaseContract.create({
    data: {
      tenantId: customer.tenantId,
      customerId,
      contractNumber: body.contractNumber ? String(body.contractNumber).trim() : null,
      productName,
      leaseCompanyName: body.leaseCompanyName ? String(body.leaseCompanyName).trim() : null,
      contractStartDate: contractStartDate!,
      contractEndDate: contractEndDate!,
      contractMonths,
      monthlyFee: body.monthlyFee != null ? Number(body.monthlyFee) : null,
      counterBaseFee,
      monoCounterRate,
      colorCounterRate,
      billingBaseDay,
      contractStatus: calc.contractStatus,
      remainingCountCached: calc.remainingCount,
      notes: body.notes ? String(body.notes).trim() : null,
      createdBy: user.id,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "create",
    tableName: "lease_contracts",
    recordId: contract.id,
    newValues: { productName, customerId, contractMonths },
  });

  return NextResponse.json({ data: contract }, { status: 201 });
}
