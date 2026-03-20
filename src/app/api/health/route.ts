import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health
 *
 * ECS / ALB ヘルスチェック用エンドポイント。
 * 認証不要。DB 疎通確認を含む。
 *
 * - 200: 正常（DB 接続 OK）
 * - 503: 異常（DB 接続失敗）
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      { status: "ok", db: "ok" },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";

    return NextResponse.json(
      { status: "error", db: "unreachable", message },
      { status: 503 },
    );
  }
}
