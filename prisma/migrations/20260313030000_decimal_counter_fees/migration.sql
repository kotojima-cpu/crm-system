-- AlterTable: Int → Decimal(10,2) for counter fee fields
ALTER TABLE "lease_contracts"
  ALTER COLUMN "counter_base_fee" TYPE DECIMAL(10,2),
  ALTER COLUMN "mono_counter_rate" TYPE DECIMAL(10,2),
  ALTER COLUMN "color_counter_rate" TYPE DECIMAL(10,2);
