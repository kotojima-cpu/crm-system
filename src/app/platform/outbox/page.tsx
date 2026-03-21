/**
 * /platform/outbox — outbox 一覧画面（platform_admin 専用）
 *
 * summary カード + filter + テーブル で構成。
 * server component として直接 service を呼び出す。
 */

import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listOutboxEvents, getOutboxSummary, getOutboxOperationalAlerts } from "@/features/platform-outbox";
import { OutboxSummaryCards } from "@/components/platform-outbox/outbox-summary-cards";
import { OutboxFilterForm } from "@/components/platform-outbox/outbox-filter-form";
import { OutboxTable } from "@/components/platform-outbox/outbox-table";
import { OutboxRecoveryPanel } from "@/components/platform-outbox/outbox-recovery-panel";
import { OutboxHealthCheckPanel } from "@/components/platform-outbox/outbox-health-check-panel";
import { OutboxHealthHistoryList } from "@/components/platform-outbox/outbox-health-history-list";
import { OutboxAlertHistoryList } from "@/components/platform-outbox/outbox-alert-history-list";
import { OutboxHistoryDashboardCards } from "@/components/platform-outbox/outbox-history-dashboard-cards";
import { OutboxHistoryCleanupPanel } from "@/components/platform-outbox/outbox-history-cleanup-panel";
import { listHealthCheckHistory } from "@/features/platform-health-history";
import { listPlatformAlertHistory } from "@/features/platform-alert-history";
import { getPlatformHistoryDashboardSummary } from "@/features/platform-history-dashboard";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function OutboxContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const statusParam = params.status;
  const status = Array.isArray(statusParam)
    ? statusParam
    : statusParam
      ? [statusParam]
      : undefined;
  const eventType = typeof params.eventType === "string" ? params.eventType : undefined;
  const executionMode = typeof params.executionMode === "string" ? params.executionMode : undefined;
  const limit = Math.min(parseInt(String(params.limit ?? "50"), 10) || 50, 200);
  const offset = parseInt(String(params.offset ?? "0"), 10) || 0;

  const [{ items, total }, summary, alerts, healthHistoryItems, alertHistoryItems, historyDashboard] = await Promise.all([
    listOutboxEvents({ status, eventType, executionMode }, { limit, offset }),
    getOutboxSummary(),
    getOutboxOperationalAlerts(),
    listHealthCheckHistory(10),
    listPlatformAlertHistory({ limit: 10 }),
    getPlatformHistoryDashboardSummary(),
  ]);

  return (
    <div className="space-y-6">
      <OutboxSummaryCards summary={summary} alerts={alerts} />
      <OutboxHistoryDashboardCards summary={historyDashboard} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OutboxRecoveryPanel />
        <OutboxHealthCheckPanel />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OutboxHistoryCleanupPanel />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Health Check 履歴</h3>
          <OutboxHealthHistoryList items={healthHistoryItems} />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Alert 履歴</h3>
          <OutboxAlertHistoryList items={alertHistoryItems} />
        </div>
      </div>
      <OutboxFilterForm />
      <OutboxTable items={items} total={total} limit={limit} offset={offset} />
    </div>
  );
}

export default async function PlatformOutboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user?.role !== "platform_master" && session.user?.role !== "platform_operator" && session.user?.role !== "platform_admin")) {
    redirect("/login");
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Outbox イベント管理</h1>
          <p className="text-sm text-gray-500">
            非同期処理の状態確認・retry・replay を行います
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/platform/outbox?status=failed" className="border rounded px-3 py-1.5 hover:bg-gray-50">
            failed
          </Link>
          <Link href="/platform/outbox?status=dead" className="border rounded px-3 py-1.5 hover:bg-red-50 text-red-700">
            dead
          </Link>
          <Link href="/platform/outbox?status=processing" className="border rounded px-3 py-1.5 hover:bg-orange-50 text-orange-700">
            stuck
          </Link>
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-gray-400">読み込み中…</div>}>
        <OutboxContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
