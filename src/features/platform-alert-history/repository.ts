import { prisma } from "@/shared/db";
import type { PlatformAlertHistoryRecord, AlertChannel } from "./types";

export async function listPlatformAlertHistory(input?: {
  limit?: number;
  channel?: AlertChannel;
  alertKeyContains?: string;
}): Promise<PlatformAlertHistoryRecord[]> {
  const limit = Math.min(input?.limit ?? 20, 100);

  const where: Record<string, unknown> = {};
  if (input?.channel) {
    where.channel = input.channel;
  }
  if (input?.alertKeyContains) {
    where.alertKey = { contains: input.alertKeyContains };
  }

  const records = await prisma.platformAlertHistory.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { lastSentAt: "desc" },
    take: limit,
  });

  return records.map((r) => ({
    id: r.id,
    alertKey: r.alertKey,
    channel: r.channel as AlertChannel,
    lastSentAt: r.lastSentAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
