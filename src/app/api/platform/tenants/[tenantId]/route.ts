/**
 * GET   /api/platform/tenants/[tenantId] — テナント詳細取得
 * PATCH /api/platform/tenants/[tenantId] — テナント契約者情報更新
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import {
  getTenantDetail,
  updateTenantContractor,
  validateTenantIdParam,
  validateUpdateContractorInput,
} from "@/features/platform-tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = validateTenantIdParam(tenantIdStr);

    const { user, runInContext } = await requirePlatformPermission(
      Permission.TENANT_READ,
      request,
    );

    return runInContext(async () => {
      const tenant = await getTenantDetail(
        { actorUserId: user.id, actorRole: user.role },
        tenantId,
      );
      return NextResponse.json({ data: tenant });
    });
  } catch (error) {
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = validateTenantIdParam(tenantIdStr);

    const { user, runInContext } = await requirePlatformPermission(
      Permission.TENANT_WRITE,
      request,
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateUpdateContractorInput(body);
      const tenant = await updateTenantContractor(
        { actorUserId: user.id, actorRole: user.role },
        tenantId,
        input,
      );
      return NextResponse.json({ data: tenant });
    });
  } catch (error) {
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
