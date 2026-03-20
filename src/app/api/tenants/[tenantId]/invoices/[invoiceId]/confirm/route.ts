/**
 * POST /api/tenants/[tenantId]/invoices/[invoiceId]/confirm — 請求確定
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { confirmInvoice } from "@/features/invoices";

type RouteContext = { params: Promise<{ tenantId: string; invoiceId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid, invoiceId: iid } = await context.params;
    const tenantId = toTenantId(Number(tid));
    const invoiceId = Number(iid);

    const { user, runInContext } = await requireTenantPermission(
      Permission.INVOICE_CONFIRM, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const invoice = await confirmInvoice(
        { tenantId: user.tenantId!, actorUserId: user.id, actorRole: user.role },
        invoiceId,
      );
      return NextResponse.json({ data: invoice });
    });
  } catch (error) { return handleError(error); }
}

function handleError(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json(toErrorResponse(error), { status: 400 });
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const e = error as { statusCode: number };
    return NextResponse.json(toErrorResponse(error as Parameters<typeof toErrorResponse>[0]), { status: e.statusCode });
  }
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "内部エラーが発生しました" } }, { status: 500 });
}
