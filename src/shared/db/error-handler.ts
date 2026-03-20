/**
 * DB エラーハンドリング
 *
 * Prisma エラーをアプリケーションエラーに変換する。
 */

import { Prisma } from "@prisma/client";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { logger } from "../logging";

/**
 * Prisma エラーをアプリケーションエラーに変換する。
 * 未知のエラーはそのまま再スローする。
 */
export function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        // Unique constraint violation
        const target = (error.meta?.target as string[])?.join(", ") ?? "unknown";
        throw new ValidationError(`一意制約違反: ${target}`);
      }
      case "P2025":
        // Record not found
        throw new NotFoundError();
      case "P2003":
        // Foreign key constraint violation
        throw new ValidationError("関連レコードが存在しません");
      default:
        logger.error("Prisma known error", error, { code: error.code });
        throw new AppError("DB_ERROR", `データベースエラー: ${error.code}`, 500);
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error("Prisma validation error", error);
    throw new ValidationError("データベースバリデーションエラー");
  }

  throw error;
}
