/**
 * GET /api/platform/outbox — outbox イベント一覧取得
 *
 * platform_admin が outbox の状態を確認する。
 * failed / dead / stuck イベントの可視化に使う。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { listOutboxEvents } from "@/features/platform-outbox";

export async function GET(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return runInContext(async () => {
      const url = request.nextUrl;
      const status = url.searchParams.getAll("status");
      const eventType = url.searchParams.get("eventType") ?? undefined;
      const executionMode = url.searchParams.get("executionMode") ?? undefined;
      const fromCreatedAt = url.searchParams.get("fromCreatedAt")
        ? new Date(url.searchParams.get("fromCreatedAt")!)
        : undefined;
      const toCreatedAt = url.searchParams.get("toCreatedAt")
        ? new Date(url.searchParams.get("toCreatedAt")!)
        : undefined;
      const limit = Math.min(
        parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
        200,
      );
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

      const { items, total } = await listOutboxEvents(
        { status: status.length > 0 ? status : undefined, eventType, executionMode, fromCreatedAt, toCreatedAt },
        { limit, offset },
      );

      return NextResponse.json({
        data: { items, total, limit, offset },
      });
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
