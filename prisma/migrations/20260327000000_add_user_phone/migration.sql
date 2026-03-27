-- User に電話番号カラムを追加（プロフィール編集機能の前提）
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(50);
