-- CreateTable
CREATE TABLE "platform_alert_histories" (
    "id" SERIAL NOT NULL,
    "alert_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_alert_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_health_check_histories" (
    "id" SERIAL NOT NULL,
    "summary_json" TEXT NOT NULL,
    "alert_codes_json" TEXT NOT NULL,
    "metrics_published" BOOLEAN NOT NULL,
    "notifications_sent" BOOLEAN NOT NULL,
    "suppressed_by_cooldown" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_health_check_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_alert_histories_alert_key_channel_key" ON "platform_alert_histories"("alert_key", "channel");
