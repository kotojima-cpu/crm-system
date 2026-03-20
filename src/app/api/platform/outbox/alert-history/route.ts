/**
 * GET /api/platform/outbox/alert-history — alert cooldown 履歴取得
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { listPlatformAlertHistory } from "@/features/platform-alert-history";

export async function GET(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return await runInContext(async () => {
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
      const channelParam = url.searchParams.get("channel");
      const channel =
        channelParam === "webhook" || channelParam === "mail"
          ? channelParam
          : undefined;
      const alertKeyParam = url.searchParams.get("alertKey");
      const alertKeyContains = alertKeyParam ? alertKeyParam : undefined;

      const items = await listPlatformAlertHistory({ limit, channel, alertKeyContains });
      return NextResponse.json({ data: { items } });
    });
  } catch (error) {
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
}
