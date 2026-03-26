/**
 * POST /api/platform/tenants/[tenantId]/delete — テナント論理削除
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { deleteTenant, validateTenantIdParam } from "@/features/platform-tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = validateTenantIdParam(tenantIdStr);

    const { user, runInContext } = await requirePlatformPermission(
      Permission.TENANT_DELETE,
      request,
    );

    return runInContext(async () => {
      const body = await request.json();

      if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
        throw new ValidationError("削除理由は必須です");
      }

      const tenant = await deleteTenant(
        { actorUserId: user.id, actorRole: user.role },
        tenantId,
        { reason: body.reason.trim() },
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
