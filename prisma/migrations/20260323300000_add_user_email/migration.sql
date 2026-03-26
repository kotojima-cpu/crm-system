-- AlterTable: User に本人連絡先メールアドレスを追加
-- 既存ユーザーは NULL（将来のメールセルフリセット前提整備）
-- 新規作成時は UI/API で必須入力にする（DB 制約は nullable のまま）
ALTER TABLE "users" ADD COLUMN "email" VARCHAR;
