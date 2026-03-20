import { Fragment } from "react";
import type { PlatformHealthCheckHistoryRecord } from "@/features/platform-health-history/types";
import {
  determineHealthCheckStatusFromCodes,
  parseHealthHistorySummary,
  parseHealthHistoryAlertCodes,
} from "@/features/platform-health-history";
import type { HealthCheckStatus } from "@/features/platform-health-history/types";

function StatusBadge({ status }: { status: HealthCheckStatus }) {
  const classes = {
    healthy: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

interface OutboxHealthHistoryListProps {
  items: PlatformHealthCheckHistoryRecord[];
}

export function OutboxHealthHistoryList({ items }: OutboxHealthHistoryListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400">履歴がありません</p>;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">実行日時</th>
            <th className="px-3 py-2 text-left font-medium">ステータス</th>
            <th className="px-3 py-2 text-left font-medium">Metrics</th>
            <th className="px-3 py-2 text-left font-medium">通知</th>
            <th className="px-3 py-2 text-left font-medium">Cooldown 抑制</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const alertCodes = parseHealthHistoryAlertCodes(item);
            const status = determineHealthCheckStatusFromCodes(alertCodes);
            const summary = parseHealthHistorySummary(item);

            return (
              <Fragment key={item.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">
                    {item.createdAt.toLocaleString("ja-JP")}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-3 py-2">{item.metricsPublished ? "済" : "未"}</td>
                  <td className="px-3 py-2">{item.notificationsSent ? "済" : "未"}</td>
                  <td className="px-3 py-2">{item.suppressedByCooldown ? "あり" : "なし"}</td>
                </tr>
                {summary && (
                  <tr key={`${item.id}-summary`} className="bg-gray-50 border-b">
                    <td colSpan={5} className="px-4 py-1 text-gray-500">
                      pending: {summary.pendingCount} / failed: {summary.failedCount} / dead: {summary.deadCount} / stuck: {summary.stuckProcessingCount} / recoverable: {summary.recoverableStuckCount ?? 0}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
