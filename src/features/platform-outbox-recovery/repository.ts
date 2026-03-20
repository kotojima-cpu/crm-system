import { prisma } from "@/shared/db";
import type { RecoverableOutboxEventView } from "./types";

/**
 * recovery 対象の stuck processing event を取得する。
 * status=processing かつ updatedAt < now - thresholdMinutes
 */
export async function findRecoverableStuckOutboxEvents(input: {
  thresholdMinutes: number;
  limit: number;
}): Promise<RecoverableOutboxEventView[]> {
  const threshold = new Date(Date.now() - input.thresholdMinutes * 60 * 1000);
  const records = await prisma.outboxEvent.findMany({
    where: {
      status: "processing",
      updatedAt: { lt: threshold },
    },
    orderBy: { updatedAt: "asc" },
    take: input.limit,
    select: {
      id: true,
      eventType: true,
      executionMode: true,
      status: true,
      updatedAt: true,
      retryCount: true,
      maxRetries: true,
    },
  });
  return records;
}

/**
 * stuck processing event を failed にリセットする。
 * retryCount は増やさない（経緯として残す）。
 * availableAt を now にして次回 poll 対象にする。
 */
export async function markStuckEventRecovered(
  id: number,
  reason: string,
): Promise<void> {
  const now = new Date();
  await prisma.outboxEvent.update({
    where: { id },
    data: {
      status: "failed",
      lastError: `Recovered from stuck processing: ${reason}`,
      availableAt: now,
      updatedAt: now,
    },
  });
}

/**
 * recovery 対象 stuck event の件数のみ返す。
 */
export async function countRecoverableStuckOutboxEvents(
  thresholdMinutes: number,
): Promise<number> {
  const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return await prisma.outboxEvent.count({
    where: {
      status: "processing",
      updatedAt: { lt: threshold },
    },
  });
}
