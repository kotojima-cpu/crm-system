-- CreateTable
CREATE TABLE "outbox_events" (
    "id" SERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "execution_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload_json" TEXT NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_outbox_events_status_available" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "idx_outbox_events_event_type" ON "outbox_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_outbox_events_created_at" ON "outbox_events"("created_at");
