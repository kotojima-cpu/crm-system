/**
 * POST /api/platform/tenants/[tenantId]/suspend — テナント停止予約
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  suspendTenant,
  validateTenantIdParam,
  validateSuspendTenantInput,
} from "@/features/platform-tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = validateTenantIdParam(tenantIdStr);

    const { user, runInContext } = await requirePlatformPermission(
      Permission.TENANT_SUSPEND,
      request,
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateSuspendTenantInput(body);

      const tenant = await suspendTenant(
        {
          actorUserId: user.id,
          actorRole: user.role,
        },
        tenantId,
        input,
      );

      return NextResponse.json({ data: tenant });
    });
  } catch (error) {
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
}
