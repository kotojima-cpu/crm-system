/**
 * GET /api/platform/outbox/alert-status — 最新アラートステータス取得
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import {
  getLatestHealthCheckHistory,
  determineHealthCheckStatusFromCodes,
} from "@/features/platform-health-history";

export async function GET(request: NextRequest) {
  try {
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return await runInContext(async () => {
      const latest = await getLatestHealthCheckHistory();
      const alertCodes: string[] = latest ? JSON.parse(latest.alertCodesJson) : [];
      return NextResponse.json({
        data: {
          lastHealthCheckAt: latest?.createdAt ?? null,
          suppressedByCooldown: latest?.suppressedByCooldown ?? false,
          alertCodes,
          status: determineHealthCheckStatusFromCodes(alertCodes),
        },
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number };
      return NextResponse.json(toErrorResponse(error as Parameters<typeof toErrorResponse>[0]), { status: e.statusCode });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "内部エラーが発生しました" } }, { status: 500 });
  }
}
