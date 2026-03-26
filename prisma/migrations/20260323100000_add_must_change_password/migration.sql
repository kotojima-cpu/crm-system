-- AlterTable: User に初回パスワード変更必須フラグを追加
-- 既存ユーザーは false（変更不要）、新規発行ユーザーは true で作成する
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
