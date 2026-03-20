/**
 * GET   /api/tenants/[tenantId]/customers/[customerId] — 顧客詳細
 * PATCH /api/tenants/[tenantId]/customers/[customerId] — 顧客更新
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  getCustomerById,
  updateCustomer,
  validateUpdateCustomerInput,
} from "@/features/customers";

type RouteContext = { params: Promise<{ tenantId: string; customerId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr, customerId: customerIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));
    const customerId = Number(customerIdStr);

    if (isNaN(customerId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
        { status: 400 },
      );
    }

    const { user, runInContext } = await requireTenantPermission(
      Permission.CUSTOMER_READ,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const customer = await getCustomerById(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        customerId,
      );

      return NextResponse.json({ data: customer });
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr, customerId: customerIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));
    const customerId = Number(customerIdStr);

    if (isNaN(customerId)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "IDが不正です" } },
        { status: 400 },
      );
    }

    const { user, runInContext } = await requireTenantPermission(
      Permission.CUSTOMER_WRITE,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateUpdateCustomerInput(body);

      const updated = await updateCustomer(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        customerId,
        input,
      );

      return NextResponse.json({ data: updated });
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
