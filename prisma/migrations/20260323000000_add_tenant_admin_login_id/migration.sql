-- テナントに初期管理者のログインIDを保持（契約者情報の表示用、編集不可）
ALTER TABLE "tenants" ADD COLUMN "admin_login_id" TEXT;
