/**
 * /api/profile — 本人情報の取得・更新
 *
 * GET:  自分自身の情報を返す
 * PUT:  自分自身の情報を更新する
 *       email / phone 変更時は currentPassword 必須
 *       name 変更は platform_master のみ（currentPassword 不要）
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: { message: "認証が必要です" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      id: true,
      loginId: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      tenantId: true,
      tenant: { select: { name: true } },
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: { message: "ユーザーが見つかりません" } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      createdAt: user.createdAt,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: { message: "認証が必要です" } }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const role = session.user.role;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "リクエストが不正です" } }, { status: 400 });
  }

  const { name, email, phone, currentPassword } = body as {
    name?: string;
    email?: string;
    phone?: string;
    currentPassword?: string;
  };

  // 更新データの組み立て
  const updateData: Record<string, unknown> = {};
  let needsPasswordVerification = false;

  // name: platform_master のみ変更可
  if (name !== undefined) {
    if (role !== "platform_master") {
      return NextResponse.json({ error: { message: "氏名の変更は親管理者のみ可能です" } }, { status: 403 });
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: { message: "氏名は必須です" } }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: { message: "氏名は100文字以内で入力してください" } }, { status: 400 });
    }
    updateData.name = name.trim();
  }

  // email
  if (email !== undefined) {
    const trimmed = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: { message: "メールアドレスの形式が不正です" } }, { status: 400 });
    }
    updateData.email = trimmed || null;
    needsPasswordVerification = true;
  }

  // phone
  if (phone !== undefined) {
    const trimmed = typeof phone === "string" ? phone.trim() : "";
    if (trimmed.length > 50) {
      return NextResponse.json({ error: { message: "電話番号は50文字以内で入力してください" } }, { status: 400 });
    }
    updateData.phone = trimmed || null;
    needsPasswordVerification = true;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: { message: "更新する項目がありません" } }, { status: 400 });
  }

  // email/phone 変更時はパスワード検証
  if (needsPasswordVerification) {
    if (!currentPassword || typeof currentPassword !== "string") {
      return NextResponse.json(
        { error: { message: "メールアドレスまたは電話番号の変更にはパスワードの再入力が必要です" } },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: { message: "ユーザーが見つかりません" } }, { status: 404 });
    }

    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: { message: "パスワードが正しくありません" } }, { status: 400 });
    }
  }

  // email UNIQUE チェック
  if (updateData.email) {
    const existing = await prisma.user.findFirst({
      where: { email: updateData.email as string, id: { not: userId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: { message: "このメールアドレスは既に使用されています" } },
        { status: 409 },
      );
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    // Prisma UNIQUE violation fallback
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: { message: "このメールアドレスは既に使用されています" } },
        { status: 409 },
      );
    }
    throw err;
  }
}
