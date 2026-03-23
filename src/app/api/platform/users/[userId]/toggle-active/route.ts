/**
 * PATCH /api/platform/users/[userId]/toggle-active — 運営担当者の有効/無効切替（platform_master のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ForbiddenError, NotFoundError } from "@/shared/errors";
import { prisma } from "@/shared/db";
import { writeAuditLog } from "@/audit";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { userId: userIdStr } = await context.params;
    const userId = Number(userIdStr);
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "無効なユーザーIDです" } },
        { status: 400 },
      );
    }

    const { user, runInContext } = await requirePlatformPermission(
      Permission.OPERATOR_MANAGE,
      request,
    );

    return runInContext(async () => {
      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true, tenantId: true },
      });

      if (!target || target.tenantId !== null) {
        throw new NotFoundError("運営担当者");
      }

      // platform_master は停止できない
      if (target.role === "platform_master") {
        throw new ForbiddenError("親管理者アカウントは停止できません");
      }

      // 自分自身は停止できない
      if (target.id === user.id) {
        throw new ForbiddenError("自分自身のアカウントは停止できません");
      }

      // platform_operator のみ対象
      if (target.role !== "platform_operator") {
        throw new ForbiddenError("この操作は運営担当者アカウントにのみ実行できます");
      }

      const newStatus = !target.isActive;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: newStatus },
        select: {
          id: true,
          loginId: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      // 監査ログ（runInContext 内なので actorUserId は RequestContext から自動補完）
      await writeAuditLog(prisma, {
        resourceType: "user",
        action: "update",
        recordId: updated.id,
        result: "success",
        message: `Platform operator "${updated.loginId}" ${newStatus ? "reactivated" : "suspended"}`,
        newValues: { isActive: newStatus },
      });

      return NextResponse.json({ data: updated });
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
