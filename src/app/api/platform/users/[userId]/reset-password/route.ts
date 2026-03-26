import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ userId: string }> };

/** platform_master が platform_operator のパスワードを再発行する */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "platform_master") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const { userId } = await params;
  const targetId = Number(userId);
  if (!targetId || isNaN(targetId)) {
    return NextResponse.json({ error: "不正なユーザーIDです" }, { status: 400 });
  }

  const body = await request.json();
  const { newPassword } = body;

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "仮パスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  // 対象ユーザーの確認（platform_operator のみ対象）
  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, loginId: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  if (targetUser.role !== "platform_operator") {
    return NextResponse.json(
      { error: "この操作は親担当者アカウントのみ対象です" },
      { status: 400 },
    );
  }

  const passwordHash = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash,
      mustChangePassword: true,
      loginFailedCount: 0,
      lockedUntil: null,
    },
  });

  return NextResponse.json({
    message: `${targetUser.loginId} のパスワードを再発行しました`,
  });
}
