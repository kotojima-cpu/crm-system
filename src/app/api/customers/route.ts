import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/lib/audit";
import { getSessionUser, unauthorizedResponse } from "@/lib/session";

// GET /api/customers — 一覧取得（検索・ページネーション）
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorizedResponse();

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
  const where: Record<string, unknown> = { isDeleted: false };
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

  const { companyName, companyNameKana, zipCode, address, phone, fax, contactName, contactPhone, contactEmail, notes } = body as Record<string, string>;

  // バリデーション
  const errors: { field: string; message: string }[] = [];
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

  const customer = await prisma.customer.create({
    data: {
      companyName: companyName.trim(),
      companyNameKana: companyNameKana?.trim() || null,
      zipCode: zipCode?.trim() || null,
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      phoneNumberNormalized: normalizePhone(phone),
      fax: fax?.trim() || null,
      contactName: contactName?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      notes: notes?.trim() || null,
      createdBy: user.id,
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
