/**
 * POST /api/platform/outbox/poll — outbox poll サイクル実行
 *
 * platform_admin が実行する。
 * pending / failed な outbox event を処理する。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError, NotFoundError } from "@/shared/errors";
import { runPollCycle } from "@/features/platform-outbox";

export async function POST(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_POLL_EXECUTE,
      request,
    );

    return runInContext(async () => {
      const body = await request.json().catch(() => ({}));
      const limit = typeof body.limit === "number" ? body.limit : 50;
      const executionMode = typeof body.executionMode === "string"
        ? body.executionMode
        : undefined;

      const result = await runPollCycle({ limit, executionMode });

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
