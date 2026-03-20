/**
 * POST /api/tenants/[tenantId]/users/invitations — 招待予約登録
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantAdminPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { createInvitation, validateCreateInvitationInput } from "@/features/tenant-users";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tenantIdStr } = await context.params;
    const tenantId = toTenantId(Number(tenantIdStr));

    const { user, runInContext } = await requireTenantAdminPermission(
      Permission.USER_WRITE,
      request,
      { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateCreateInvitationInput(body);

      const invitation = await createInvitation(
        {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          actorRole: user.role,
        },
        input,
      );

      return NextResponse.json({ data: invitation }, { status: 201 });
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
