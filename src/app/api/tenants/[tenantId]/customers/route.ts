/**
 * GET  /api/tenants/[tenantId]/customers — 顧客一覧
 * POST /api/tenants/[tenantId]/customers — 顧客新規作成
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  listCustomers,
  createCustomer,
  validateCreateCustomerInput,
} from "@/features/customers";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));

    const { user, runInContext } = await requireTenantPermission(
      Permission.CUSTOMER_READ,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const { searchParams } = request.nextUrl;
      const result = await listCustomers(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        {
          tenantId: user.tenantId!,
          page: Math.max(1, Number(searchParams.get("page")) || 1),
          limit: Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20)),
          search: searchParams.get("search") || undefined,
          sortBy: (searchParams.get("sortBy") as "companyName" | "updatedAt") || undefined,
          sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
        },
      );

      return NextResponse.json(result);
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));

    const { user, runInContext } = await requireTenantPermission(
      Permission.CUSTOMER_WRITE,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateCreateCustomerInput(body);

      const customer = await createCustomer(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        input,
      );

      return NextResponse.json({ data: customer }, { status: 201 });
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(toErrorResponse(error), { status: 400 });
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const appError = error as { statusCode: number };
    return NextResponse.json(
      toErrorResponse(error as Parameters<typeof toErrorResponse>[0]),
      { status: appError.statusCode },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "内部エラーが発生しました" } },
    { status: 500 },
  );
}
