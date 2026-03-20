/**
 * GET /api/platform/outbox/summary — outbox 集計サマリー取得
 *
 * pending / processing / failed / dead / sent の件数と
 * 運用アラート情報を返す。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse } from "@/shared/errors";
import { getOutboxSummary, getOutboxOperationalAlerts } from "@/features/platform-outbox";

export async function GET(request: NextRequest) {
  try {
    // OUTBOX_READ または MONITORING_READ どちらかがあれば閲覧できる
    // 現行実装: OUTBOX_READ で統一（将来 MONITORING_READ ロール追加時に分岐を追加）
    const { runInContext } = await requirePlatformPermission(
      Permission.OUTBOX_READ,
      request,
    );

    return runInContext(async () => {
      const [summary, alerts] = await Promise.all([
        getOutboxSummary(),
        getOutboxOperationalAlerts(),
      ]);

      return NextResponse.json({ data: { ...summary, alerts } });
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
