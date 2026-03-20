/**
 * POST /api/platform/outbox/[eventId]/force-replay — sent event を強制 replay
 *
 * ⚠️ 危険操作: 冪等でない handler では二重送信が発生する可能性がある。
 * 通常の retry/replay とは別導線に置くこと。
 * forceSentReplay=true を明示しないとエラーになる。
 * 操作は必ず AuditLog に記録される。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { forceReplaySentEvent } from "@/features/platform-outbox";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    // ⚠️ 危険操作: OUTBOX_FORCE_REPLAY 専用 permission で保護
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_FORCE_REPLAY,
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
      // 危険操作: 明示フラグが必要
      if (body.forceSentReplay !== true) {
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "forceSentReplay=true を明示してください。この操作は危険です（二重送信リスク）。",
            },
          },
          { status: 400 },
        );
      }

      const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
      const result = await forceReplaySentEvent(eventId, { forceSentReplay: true, reason });
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
