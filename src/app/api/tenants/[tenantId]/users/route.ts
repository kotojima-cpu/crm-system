/**
 * GET /api/tenants/[tenantId]/users — テナントユーザー一覧
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantAdminPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse } from "@/shared/errors";
import { listTenantUsers } from "@/features/tenant-users";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));

    const { user, runInContext } = await requireTenantAdminPermission(
      Permission.USER_READ,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const { searchParams } = request.nextUrl;
      const result = await listTenantUsers(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        {
          tenantId: user.tenantId!,
          page: Math.max(1, Number(searchParams.get("page")) || 1),
          limit: Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20)),
        },
      );

      return NextResponse.json(result);
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
