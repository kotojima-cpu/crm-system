/**
 * Prisma クライアント（共通基盤版）
 *
 * 既存の src/lib/prisma.ts を置き換える共通基盤。
 * Next.js の hot reload 対応のシングルトン。
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
