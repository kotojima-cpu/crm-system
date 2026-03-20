/**
 * POST /api/platform/billing/monthly-run — 月次請求バッチ実行
 *
 * platform_admin が実行する。
 * tenantId 指定時は単一 tenant、未指定時は全 tenant を処理する。
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requirePlatformPermission } from "@/auth/guards";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  generateMonthlyInvoicesForTenant,
  generateMonthlyInvoicesForAllTenants,
  validateGenerateMonthlyInvoicesInput,
} from "@/features/billing-batch";

export async function POST(request: NextRequest) {
  try {
    const { user, runInContext } = await requirePlatformPermission(
      Permission.BATCH_EXECUTE,
      request,
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateGenerateMonthlyInvoicesInput(body);

      if (input.tenantId) {
        // 単一 tenant
        const result = await generateMonthlyInvoicesForTenant(
          { tenantId: null, actorUserId: user.id, actorRole: user.role },
          input,
        );
        return NextResponse.json({ data: result });
      } else {
        // 全 tenant
        const result = await generateMonthlyInvoicesForAllTenants(
          { tenantId: null, actorUserId: user.id, actorRole: user.role },
          input,
        );
        return NextResponse.json({ data: result });
      }
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(toErrorResponse(error), { status: 400 });
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
