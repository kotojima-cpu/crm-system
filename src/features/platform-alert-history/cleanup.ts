import { prisma } from "@/shared/db";

export async function cleanupOldPlatformAlertHistory(retentionDays = 30): Promise<number> {
  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.platformAlertHistory.deleteMany({
    where: {
      lastSentAt: { lt: threshold },
    },
  });
  return result.count;
}
