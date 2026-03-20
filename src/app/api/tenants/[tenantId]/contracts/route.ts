/**
 * GET  /api/tenants/[tenantId]/contracts — 契約一覧
 * POST /api/tenants/[tenantId]/contracts — 契約新規作成
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  listContracts,
  createContract,
  validateCreateContractInput,
} from "@/features/contracts";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid } = await context.params;
    const tenantId = toTenantId(Number(tid));

    const { user, runInContext } = await requireTenantPermission(
      Permission.CONTRACT_READ, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const sp = request.nextUrl.searchParams;
      const result = await listContracts(
        { tenantId: user.tenantId!, actorUserId: user.id, actorRole: user.role },
        {
          tenantId: user.tenantId!,
          page: Math.max(1, Number(sp.get("page")) || 1),
          limit: Math.min(100, Math.max(1, Number(sp.get("limit")) || 20)),
          customerId: sp.get("customerId") ? Number(sp.get("customerId")) : undefined,
          status: sp.get("status") || undefined,
        },
      );
      return NextResponse.json(result);
    });
  } catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid } = await context.params;
    const tenantId = toTenantId(Number(tid));

    const { user, runInContext } = await requireTenantPermission(
      Permission.CONTRACT_WRITE, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateCreateContractInput(body);
      const contract = await createContract(
        { tenantId: user.tenantId!, actorUserId: user.id, actorRole: user.role },
        input,
      );
      return NextResponse.json({ data: contract }, { status: 201 });
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
