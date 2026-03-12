-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "login_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sales',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_name_kana" TEXT,
    "zip_code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "phone_number_normalized" TEXT,
    "fax" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_contracts" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "contract_number" TEXT,
    "product_name" TEXT NOT NULL,
    "lease_company_name" TEXT,
    "contract_start_date" TIMESTAMP(3) NOT NULL,
    "contract_end_date" TIMESTAMP(3) NOT NULL,
    "contract_months" INTEGER NOT NULL,
    "monthly_fee" INTEGER,
    "billing_base_day" INTEGER,
    "contract_status" TEXT NOT NULL DEFAULT 'active',
    "remaining_count_cached" INTEGER,
    "manual_override_remaining_count" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" INTEGER,
    "old_values" TEXT,
    "new_values" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE INDEX "idx_customers_company_name" ON "customers"("company_name");

-- CreateIndex
CREATE INDEX "idx_customers_company_name_kana" ON "customers"("company_name_kana");

-- CreateIndex
CREATE INDEX "idx_customers_phone" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "idx_customers_phone_normalized" ON "customers"("phone_number_normalized");

-- CreateIndex
CREATE INDEX "idx_customers_contact_name" ON "customers"("contact_name");

-- CreateIndex
CREATE INDEX "idx_customers_is_deleted" ON "customers"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "lease_contracts_contract_number_key" ON "lease_contracts"("contract_number");

-- CreateIndex
CREATE INDEX "idx_contracts_customer_id" ON "lease_contracts"("customer_id");

-- CreateIndex
CREATE INDEX "idx_contracts_status" ON "lease_contracts"("contract_status");

-- CreateIndex
CREATE INDEX "idx_contracts_start_date" ON "lease_contracts"("contract_start_date");

-- CreateIndex
CREATE INDEX "idx_contracts_end_date" ON "lease_contracts"("contract_end_date");

-- CreateIndex
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_table_name" ON "audit_logs"("table_name");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_contracts" ADD CONSTRAINT "lease_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_contracts" ADD CONSTRAINT "lease_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
