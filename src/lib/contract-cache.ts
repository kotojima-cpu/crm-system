import { prisma } from "@/lib/prisma";
import { resolveRemainingCount } from "@/lib/contract-utils";

/**
 * active / expiring_soon 契約の remainingCountCached を再計算して更新する。
 * TypeScript の resolveRemainingCount() を正本として使用し、
 * manualOverrideRemainingCount がある場合はその値を優先してキャッシュに反映する。
 */
export async function refreshRemainingCountCache(): Promise<void> {
  const contracts = await prisma.leaseContract.findMany({
    where: {
      contractStatus: { notIn: ["cancelled", "expired"] },
    },
    select: {
      id: true,
      contractStartDate: true,
      contractMonths: true,
      billingBaseDay: true,
      manualOverrideRemainingCount: true,
    },
  });

  if (contracts.length === 0) return;

  // バッチ更新（トランザクションで一括実行）
  await prisma.$transaction(
    contracts.map((c) => {
      const result = resolveRemainingCount({
        contractStartDate: c.contractStartDate,
        contractMonths: c.contractMonths,
        billingBaseDay: c.billingBaseDay,
        manualOverrideRemainingCount: c.manualOverrideRemainingCount,
      });

      return prisma.leaseContract.update({
        where: { id: c.id },
        data: {
          remainingCountCached: result.remainingCount,
          contractStatus: result.contractStatus,
        },
      });
    })
  );
}
