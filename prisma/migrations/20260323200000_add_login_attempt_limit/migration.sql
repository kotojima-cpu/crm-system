-- AlterTable: User にログイン試行制限用カラムを追加
-- 既存ユーザーは 0 回失敗・ロックなし で安全に追加
ALTER TABLE "users" ADD COLUMN "login_failed_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP;
