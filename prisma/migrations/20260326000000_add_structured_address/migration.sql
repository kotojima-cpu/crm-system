-- 顧客住所の構造化カラム追加（郵便番号→住所自動反映＋将来のGoogleマップ ピン立て対応）
-- 既存の address カラムは旧データ互換として残す

ALTER TABLE "customers" ADD COLUMN "prefecture" VARCHAR(10);
ALTER TABLE "customers" ADD COLUMN "city" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN "address_line1" VARCHAR(200);
ALTER TABLE "customers" ADD COLUMN "address_line2" VARCHAR(200);

-- 将来の地図機能用 index（都道府県での絞り込み）
CREATE INDEX "idx_customers_prefecture" ON "customers"("prefecture");
