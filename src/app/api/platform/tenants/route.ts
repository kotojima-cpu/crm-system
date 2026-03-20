/**
 * GET /api/platform/tenants — テナント一覧（platform 管理者用）
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { listTenants } from "@/features/platform-tenants";

export async function GET(request: NextRequest) {
  try {
    const { user, runInContext } = await requirePlatformPermission(
      Permission.TENANT_READ,
      request,
    );

    return runInContext(async () => {
      const { searchParams } = request.nextUrl;
      const result = await listTenants(
        {
          actorUserId: user.id,
          actorRole: user.role,
        },
        {
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
