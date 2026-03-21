-- 顧客種別カラムを追加（既存データは全て "new" = 新規顧客）
ALTER TABLE "customers" ADD COLUMN "customer_type" VARCHAR(20) NOT NULL DEFAULT 'new';

-- 検索用インデックス
CREATE INDEX "idx_customers_customer_type" ON "customers"("customer_type");
