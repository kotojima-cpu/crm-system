/**
 * GET   /api/tenants/[tenantId]/contracts/[contractId] — 契約詳細
 * PATCH /api/tenants/[tenantId]/contracts/[contractId] — 契約更新
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@/auth/permissions";
import { requireTenantPermission } from "@/auth/guards";
import { toTenantId } from "@/shared/types/helpers";
import { toErrorResponse, ValidationError } from "@/shared/errors";
import {
  getContractById,
  updateContract,
  validateUpdateContractInput,
} from "@/features/contracts";

type RouteContext = { params: Promise<{ tenantId: string; contractId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid, contractId: cid } = await context.params;
    const tenantId = toTenantId(Number(tid));
    const contractId = Number(cid);
    if (isNaN(contractId)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "IDが不正です" } }, { status: 400 });
    }

    const { user, runInContext } = await requireTenantPermission(
      Permission.CONTRACT_READ, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const contract = await getContractById(
        { tenantId: user.tenantId!, actorUserId: user.id, actorRole: user.role },
        contractId,
      );
      return NextResponse.json({ data: contract });
    });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { tenantId: tid, contractId: cid } = await context.params;
    const tenantId = toTenantId(Number(tid));
    const contractId = Number(cid);
    if (isNaN(contractId)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "IDが不正です" } }, { status: 400 });
    }

    const { user, runInContext } = await requireTenantPermission(
      Permission.CONTRACT_WRITE, request, { expectedTenantId: tenantId },
    );

    return runInContext(async () => {
      const body = await request.json();
      const input = validateUpdateContractInput(body);
      const updated = await updateContract(
        { tenantId: user.tenantId!, actorUserId: user.id, actorRole: user.role },
        contractId, input,
      );
      return NextResponse.json({ data: updated });
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
