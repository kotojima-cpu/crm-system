/**
 * POST /api/platform/outbox/history-cleanup — 履歴クリーンアップ実行
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { cleanupPlatformHistory } from "@/features/platform-history-maintenance";

export async function POST(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_HEALTH_CHECK,
      request,
    );

    return await runInContext(async () => {
      const body = await request.json().catch(() => ({}));
      const retentionDays = typeof body.retentionDays === "number" ? body.retentionDays : undefined;

      const result = await cleanupPlatformHistory(retentionDays);
      return NextResponse.json({ data: result });
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      toErrorResponse(error),
      { status: error.statusCode },
    );
  }
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
