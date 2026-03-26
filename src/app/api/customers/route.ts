import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser } from "@/auth/session";
import { unauthorizedResponse } from "@/lib/session";
import { refreshRemainingCountCache } from "@/lib/contract-cache";

// GET /api/customers — 一覧取得（検索・ページネーション）
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
  const search = searchParams.get("search") || "";
  const searchCompanyName = searchParams.get("companyName") || "";
  const searchAddress = searchParams.get("address") || "";
  const searchPhone = searchParams.get("phone") || "";
  const sortBy = searchParams.get("sortBy") || "updatedAt";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  // 検索条件の組み立て
  const where: Record<string, unknown> = { isDeleted: false, tenantId: user.tenantId };
  // sales は自分の担当顧客のみ表示
  if (user.role === "sales") {
    where.assignedUserId = user.id;
  }
  const andConditions: Record<string, unknown>[] = [];

  // 汎用検索（顧客名 OR 電話番号 OR 担当者名）
  if (search) {
    const normalizedSearch = normalizePhone(search);
    andConditions.push({
      OR: [
        { companyName: { contains: search } },
        { contactName: { contains: search } },
        ...(normalizedSearch
          ? [{ phoneNumberNormalized: { contains: normalizedSearch } }]
          : []),
      ],
    });
  }

  // 個別検索条件
  if (searchCompanyName) {
    andConditions.push({ companyName: { contains: searchCompanyName } });
  }
  if (searchAddress) {
    andConditions.push({ address: { contains: searchAddress } });
  }
  if (searchPhone) {
    const normalizedPhone = normalizePhone(searchPhone);
    if (normalizedPhone) {
      andConditions.push({ phoneNumberNormalized: { contains: normalizedPhone } });
    }
  }

  // 顧客種別フィルタ
  const customerType = searchParams.get("customerType");
  if (customerType && ["new", "prospect"].includes(customerType)) {
    andConditions.push({ customerType });
  }

  // リース残回数フィルタ（検索前にキャッシュを最新化して画面表示と一致させる）
  const remainingMonths = searchParams.get("remainingMonths");
  const remainingMonthsOp = searchParams.get("remainingMonthsOp") || "lte";
  if (remainingMonths !== null && remainingMonths !== "") {
    await refreshRemainingCountCache();
    const value = Number(remainingMonths);
    if (!isNaN(value) && value >= 0) {
      let compareOp: Record<string, number>;
      switch (remainingMonthsOp) {
        case "gte": compareOp = { gte: value }; break;
        case "lte": compareOp = { lte: value }; break;
        default:    compareOp = { equals: value }; break;
      }
      andConditions.push({
        leaseContracts: {
          some: {
            remainingCountCached: compareOp,
            contractStatus: { not: "cancelled" },
          },
        },
      });
    }
  }

  if (andConditions.length > 0) {
    (where as Record<string, unknown>).AND = andConditions;
  }

  // ソートキーのホワイトリスト
  const allowedSortKeys: Record<string, string> = {
    companyName: "companyName",
    companyNameKana: "companyNameKana",
    updatedAt: "updatedAt",
    createdAt: "createdAt",
  };
  const orderByField = allowedSortKeys[sortBy] || "updatedAt";

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [orderByField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        customerType: true,
        companyName: true,
        address: true,
        phone: true,
        contactName: true,
        updatedAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST /api/customers — 新規登録
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "リクエストが不正です" } },
      { status: 400 }
    );
  }

  const { customerType, companyName, companyNameKana, zipCode, address, prefecture, city, addressLine1, addressLine2, phone, fax, contactName, contactPhone, contactEmail, notes } = body as Record<string, string>;

  // バリデーション
  const errors: { field: string; message: string }[] = [];

  // customerType
  const validCustomerTypes = ["new", "prospect"];
  const resolvedCustomerType = validCustomerTypes.includes(customerType) ? customerType : "new";

  if (!companyName || typeof companyName !== "string" || companyName.trim().length === 0) {
    errors.push({ field: "companyName", message: "会社名は必須です" });
  } else if (companyName.length > 200) {
    errors.push({ field: "companyName", message: "会社名は200文字以内で入力してください" });
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: errors[0].message, details: errors } },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  if (!dbUser?.tenantId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "テナントが割り当てられていません" } },
      { status: 403 }
    );
  }

  // 担当者の初期値は常に作成者自身
  const assignedUserId = user.id;

  // 構造化住所から旧 address を組み立て（互換同期）
  const pref = prefecture?.trim() || null;
  const ct = city?.trim() || null;
  const al1 = addressLine1?.trim() || null;
  const al2 = addressLine2?.trim() || null;
  const composedAddress = [pref, ct, al1, al2].filter(Boolean).join(" ") || null;

  const customer = await prisma.customer.create({
    data: {
      tenantId: dbUser.tenantId,
      customerType: resolvedCustomerType,
      companyName: companyName.trim(),
      companyNameKana: companyNameKana?.trim() || null,
      zipCode: zipCode?.trim() || null,
      address: composedAddress,
      prefecture: pref,
      city: ct,
      addressLine1: al1,
      addressLine2: al2,
      phone: phone?.trim() || null,
      phoneNumberNormalized: normalizePhone(phone),
      fax: fax?.trim() || null,
      contactName: contactName?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      notes: notes?.trim() || null,
      createdBy: user.id,
      assignedUserId,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "create",
    tableName: "customers",
    recordId: customer.id,
    newValues: { companyName: customer.companyName },
  });

  return NextResponse.json({ data: customer }, { status: 201 });
}
