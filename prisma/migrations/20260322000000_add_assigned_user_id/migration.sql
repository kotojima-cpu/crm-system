-- AlterTable: Customer に担当者カラムを追加
-- sales ユーザーの顧客アクセスを自分の担当顧客のみに制限するために使用
-- NULL = 未割り当て（tenant_admin のみ閲覧可）
ALTER TABLE "customers" ADD COLUMN "assigned_user_id" INTEGER;

-- FK: users.id への参照
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index: 検索パフォーマンス
CREATE INDEX "idx_customers_assigned_user_id" ON "customers"("assigned_user_id");
