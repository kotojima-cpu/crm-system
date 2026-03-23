/**
 * GET  /api/platform/users — 運営担当者一覧（platform_master のみ）
 * POST /api/platform/users — 運営担当者作成（platform_master のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ConflictError } from "@/shared/errors";
import { prisma } from "@/shared/db";
import { writeAuditLog } from "@/audit";

export async function GET(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OPERATOR_MANAGE,
      request,
    );

    return runInContext(async () => {
      const users = await prisma.user.findMany({
        where: {
          tenantId: null,
          role: { in: ["platform_operator", "platform_master"] },
        },
        select: {
          id: true,
          loginId: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ data: users });
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

export async function POST(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OPERATOR_MANAGE,
      request,
    );

    return runInContext(async () => {
      const body = await request.json();
      const { loginId, password, name } = body;

      // バリデーション
      const errors: { field: string; message: string }[] = [];
      if (!loginId || typeof loginId !== "string" || loginId.trim().length === 0) {
        errors.push({ field: "loginId", message: "ログインIDは必須です" });
      } else if (!/^[a-zA-Z0-9_-]+$/.test(loginId.trim())) {
        errors.push({ field: "loginId", message: "ログインIDは半角英数字・ハイフン・アンダースコアのみです" });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        errors.push({ field: "password", message: "パスワードは8文字以上です" });
      }
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        errors.push({ field: "name", message: "名前は必須です" });
      }
      if (errors.length > 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "入力内容に不備があります", details: errors } },
          { status: 400 },
        );
      }

      // loginId 重複チェック
      const existing = await prisma.user.findUnique({
        where: { loginId: loginId.trim() },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError(`ログインID "${loginId.trim()}" は既に使用されています`);
      }

      const passwordHash = await hash(password, 12);

      const newUser = await prisma.user.create({
        data: {
          loginId: loginId.trim(),
          passwordHash,
          name: name.trim(),
          role: "platform_operator",
          tenantId: null,
          isActive: true,
        },
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
        action: "create",
        recordId: newUser.id,
        result: "success",
        message: `Platform operator "${newUser.loginId}" created`,
        newValues: { loginId: newUser.loginId, name: newUser.name, role: newUser.role },
      });

      return NextResponse.json({ data: newUser }, { status: 201 });
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
