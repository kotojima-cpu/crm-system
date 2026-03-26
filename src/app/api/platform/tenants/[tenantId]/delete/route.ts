/**
 * POST /api/platform/tenants/[tenantId]/delete
 *
 * テナント論理削除（親管理者のみ）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteTenant, validateTenantIdParam } from "@/features/platform-tenants";
import { Permission, hasPermission } from "@/auth/permissions";
import type { UserRole } from "@/auth/types";
import { toActorUserId } from "@/shared/types/helpers";

type Params = { params: Promise<{ tenantId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "認証が必要です" } },
      { status: 401 },
    );
  }

  // 親管理者のみ（TENANT_DELETE 権限）
  if (!hasPermission(session.user.role as UserRole, Permission.TENANT_DELETE)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "この操作は親管理者のみ実行できます" } },
      { status: 403 },
    );
  }

  const { tenantId: tenantIdStr } = await params;
  const tenantId = validateTenantIdParam(tenantIdStr);

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "リクエストが不正です" } },
      { status: 400 },
    );
  }

  if (!body.reason || typeof body.reason !== "string" || body.reason.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "削除理由は必須です" } },
      { status: 400 },
    );
  }

  try {
    const result = await deleteTenant(
      { actorUserId: toActorUserId(Number(session.user.id)), actorRole: session.user.role },
      tenantId,
      { reason: body.reason.trim() },
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof Error && err.message.includes("見つかりません")) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "テナントが見つかりません" } },
        { status: 404 },
      );
    }
    throw err;
  }
}
