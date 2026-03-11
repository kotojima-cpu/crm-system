import { prisma } from "./prisma";

type AuditAction = "create" | "update" | "delete" | "login";

export async function writeAuditLog(params: {
  userId: number;
  action: AuditAction;
  tableName: string;
  recordId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
      newValues: params.newValues ? JSON.stringify(params.newValues) : null,
    },
  });
}
