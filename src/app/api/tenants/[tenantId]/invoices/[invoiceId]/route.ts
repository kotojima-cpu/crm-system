/**
 * GET /api/tenants/[tenantId]/invoices/[invoiceId] — 請求詳細
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import { getInvoiceById } from "@/features/invoices";

type RouteContext = { params: Promise<{ tenantId: string; invoiceId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid, invoiceId: iid } = await context.params;
    const tenantId = toTenantId(Number(tid));
    const invoiceId = Number(iid);

    const { user, runInContext } = await requireTenantPermission(
      Permission.INVOICE_READ, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const invoice = await getInvoiceById(
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
