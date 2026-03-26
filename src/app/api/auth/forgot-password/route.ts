import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { createMailer } from "@/infrastructure/factory";

const TOKEN_EXPIRY_MINUTES = 30;
const GENERIC_MESSAGE = "登録済みメールアドレスに再設定URLを送信しました。メールをご確認ください。";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";

    if (!loginId) {
      return NextResponse.json({ data: { message: GENERIC_MESSAGE } });
    }

    // ユーザー検索（存在有無を外部に漏らさない）
    const user = await prisma.user.findUnique({
      where: { loginId },
      select: { id: true, email: true, name: true, isActive: true },
    });

    // ユーザーが存在しない / 無効 / email なし → 同じメッセージ
    if (!user || !user.isActive || !user.email) {
      return NextResponse.json({ data: { message: GENERIC_MESSAGE } });
    }

    // 既存の未使用トークンを無効化
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // トークン生成
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // メール送信
    const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    const mailer = createMailer();
    await mailer.send({
      to: user.email,
      subject: "【OAフロント】パスワード再設定のご案内",
      text: [
        `${user.name || "ユーザー"} 様`,
        "",
        "パスワード再設定のリクエストを受け付けました。",
        "以下のURLから新しいパスワードを設定してください。",
        "",
        resetUrl,
        "",
        `このURLの有効期限は ${TOKEN_EXPIRY_MINUTES} 分です。`,
        "",
        "このメールに心当たりがない場合は、このメールを破棄してください。",
        "パスワードは変更されません。",
        "",
        "---",
        "OAフロント（株式会社ITフロンティア）",
      ].join("\n"),
      requestId: `pwd-reset-${user.id}-${Date.now()}`,
      executionContext: "system",
      tenantId: null,
      actorUserId: null,
    });

    return NextResponse.json({ data: { message: GENERIC_MESSAGE } });
  } catch (error) {
    console.error("forgot-password error:", error);
    // エラーでも同じメッセージ（ユーザー情報漏洩防止）
    return NextResponse.json({ data: { message: GENERIC_MESSAGE } });
  }
}
