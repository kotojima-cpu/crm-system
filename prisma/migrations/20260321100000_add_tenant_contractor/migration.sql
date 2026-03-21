-- テナントに契約者情報カラムを追加（既存テナントは全て NULL）
ALTER TABLE "tenants" ADD COLUMN "contractor_name" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contact_person" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "tenants" ADD COLUMN "contact_mobile" TEXT;
ALTER TABLE "tenants" ADD COLUMN "prefecture" TEXT;
