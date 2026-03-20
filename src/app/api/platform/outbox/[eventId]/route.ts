/**
 * GET /api/platform/outbox/[eventId] — outbox イベント詳細取得
 *
 * payload はマスク済みで返す（機密キーは [REDACTED]）。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { getOutboxEventDetail } from "@/features/platform-outbox";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return runInContext(async () => {
      const { eventId: eventIdStr } = await params;
      const eventId = parseInt(eventIdStr, 10);
      if (!eventId || eventId <= 0) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "eventId must be a positive integer" } },
          { status: 400 },
        );
      }

      const detail = await getOutboxEventDetail(eventId);
      return NextResponse.json({ data: detail });
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
