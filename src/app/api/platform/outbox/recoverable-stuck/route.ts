/**
 * GET /api/platform/outbox/recoverable-stuck — recovery 対象の stuck event 一覧
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { listRecoverableStuckEvents } from "@/features/platform-outbox-recovery";

export async function GET(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return runInContext(async () => {
      const { searchParams } = new URL(request.url);
      const thresholdMinutes = parseInt(searchParams.get("thresholdMinutes") ?? "15", 10) || 15;
      const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

      const items = await listRecoverableStuckEvents(thresholdMinutes, limit);
      return NextResponse.json({ data: { items, total: items.length } });
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
