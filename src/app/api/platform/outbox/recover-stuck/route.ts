/**
 * POST /api/platform/outbox/recover-stuck — stuck event の一括 recovery
 *
 * processing のまま止まっている event を failed にリセットして再試行対象にする。
 * dryRun=true で対象件数のみ確認できる。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { recoverStuckEventsAndReport } from "@/features/platform-outbox";

export async function POST(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_RECOVER_STUCK,
      request,
    );

    return await runInContext(async () => {
      const body = await request.json().catch(() => ({}));
      const thresholdMinutes = typeof body.thresholdMinutes === "number" ? body.thresholdMinutes : undefined;
      const limit = typeof body.limit === "number" ? body.limit : undefined;
      const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : false;

      const result = await recoverStuckEventsAndReport({ thresholdMinutes, limit, dryRun });

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
