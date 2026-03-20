/**
 * POST /api/platform/outbox/[eventId]/replay — dead event を replay
 *
 * dead → pending にリセットして次回 poll で再処理する。
 * resetRetryCount=true を指定すると retryCount をリセットする。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { replayDeadEvent } from "@/features/platform-outbox";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_REPLAY,
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

      const body = await request.json().catch(() => ({}));
      const resetRetryCount = body.resetRetryCount === true;

      const result = await replayDeadEvent(eventId, { resetRetryCount });
      return NextResponse.json({ data: { id: result.id, status: result.status } });
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
