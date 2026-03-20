import { prisma } from "@/shared/db";

export async function cleanupOldPlatformHealthHistory(retentionDays = 30): Promise<number> {
  const threshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.platformHealthCheckHistory.deleteMany({
    where: {
      createdAt: { lt: threshold },
    },
  });
  return result.count;
}
