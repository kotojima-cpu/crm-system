/**
 * POST /api/platform/outbox/[eventId]/retry — outbox event 手動 retry
 *
 * platform_admin が実行する。
 * failed event を pending にリセットして次回 poll 対象にする。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError, NotFoundError } from "@/shared/errors";
import { retryEvent } from "@/features/platform-outbox";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_RETRY,
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

      const result = await retryEvent(eventId);
      return NextResponse.json({ data: result });
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    const e = error as { statusCode: number };
    return NextResponse.json(toErrorResponse(error as Parameters<typeof toErrorResponse>[0]), {
      status: e.statusCode,
    });
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
