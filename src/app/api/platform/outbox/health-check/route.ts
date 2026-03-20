/**
 * POST /api/platform/outbox/health-check — Outbox ヘルスチェック
 *
 * summary 取得 + metrics 発行 + alert 通知を一括実行する。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { runOutboxHealthCheck } from "@/features/platform-outbox";

export async function POST(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_HEALTH_CHECK,
      request,
    );

    return runInContext(async () => {
      const result = await runOutboxHealthCheck();
      return NextResponse.json({ data: result });
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error && typeof error === "object" && "statusCode" in error) {
    const e = error as { statusCode: number };
    return NextResponse.json(
      toErrorResponse(error as Parameters<typeof toErrorResponse>[0]),
      { status: e.statusCode },
    );
  }
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "内部エラーが発生しました" } },
    { status: 500 },
  );
}
