import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash, compare } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "現在のパスワードと新しいパスワードを入力してください" },
      { status: 400 },
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "新しいパスワードは8文字以上で入力してください" },
      { status: 400 },
    );
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "新しいパスワードは現在のパスワードと異なるものにしてください" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: { passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  const isValid = await compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "現在のパスワードが正しくありません" }, { status: 400 });
  }

  const newHash = await hash(newPassword, 12);
  await prisma.user.update({
    where: { id: Number(session.user.id) },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
  });

  return NextResponse.json({ message: "パスワードを変更しました" });
}
