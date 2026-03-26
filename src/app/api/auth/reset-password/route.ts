import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!token) {
      return NextResponse.json(
        { error: { message: "再設定URLが無効です。もう一度パスワード再設定を行ってください。" } },
        { status: 400 },
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: { message: "パスワードは8文字以上で入力してください。" } },
        { status: 400 },
      );
    }

    if (newPassword.length > 72) {
      return NextResponse.json(
        { error: { message: "パスワードは72文字以内で入力してください。" } },
        { status: 400 },
      );
    }

    const tokenHash = hashToken(token);

    // トークン照合（未使用 + 期限内）
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, isActive: true } },
      },
    });

    if (!resetToken || !resetToken.user.isActive) {
      return NextResponse.json(
        { error: { message: "再設定URLが無効または期限切れです。もう一度パスワード再設定を行ってください。" } },
        { status: 400 },
      );
    }

    // パスワード更新 + 関連フラグリセット + トークン使用済み化（トランザクション）
    const passwordHash = await hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          loginFailedCount: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      data: { message: "パスワードを再設定しました。新しいパスワードでログインしてください。" },
    });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json(
      { error: { message: "パスワード再設定に失敗しました。もう一度お試しください。" } },
      { status: 500 },
    );
  }
}
