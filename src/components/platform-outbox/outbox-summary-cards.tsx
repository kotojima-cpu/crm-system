"use client";

import type { OutboxSummary, OutboxOperationalAlert } from "@/features/platform-outbox/types";

interface Props {
  summary: OutboxSummary;
  alerts: OutboxOperationalAlert[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 border-yellow-300 text-yellow-800",
  processing: "bg-blue-50 border-blue-300 text-blue-800",
  failed: "bg-red-50 border-red-300 text-red-800",
  dead: "bg-gray-900 border-gray-700 text-white",
  sent: "bg-green-50 border-green-300 text-green-800",
};

function SummaryCard({
  label,
  count,
  colorClass,
  warning,
}: {
  label: string;
  count: number;
  colorClass: string;
  warning?: boolean;
}) {
  return (
    <div className={`border rounded-lg p-4 ${colorClass} ${warning ? "ring-2 ring-red-500" : ""}`}>
      <div className="text-2xl font-bold">{count.toLocaleString()}</div>
      <div className="text-sm mt-1">{label}</div>
      {warning && <div className="text-xs mt-1 font-semibold">⚠️ 要対応</div>}
    </div>
  );
}

export function OutboxSummaryCards({ summary, alerts }: Props) {
  const hasDeadAlert = alerts.some((a) => a.code === "DEAD_EVENTS_EXIST");
  const hasStuckAlert = alerts.some((a) => a.code === "STUCK_PROCESSING");

  return (
    <div className="space-y-4">
      {/* アラートバナー */}
      {alerts.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 space-y-1">
          <div className="font-semibold text-orange-800 text-sm">⚠️ 運用アラート</div>
          {alerts.map((a, i) => (
            <div key={i} className="text-sm text-orange-700">
              {a.code === "DEAD_EVENTS_EXIST" &&
                `dead イベントが ${a.count} 件あります。手動 replay が必要です。`}
              {a.code === "STUCK_PROCESSING" &&
                `15分以上 processing のまま止まっているイベントが ${a.count} 件あります。`}
              {a.code === "FAILED_EVENTS_HIGH" &&
                `failed イベントが ${a.count} 件に達しています。確認してください。`}
            </div>
          ))}
        </div>
      )}

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="待機中 (pending)" count={summary.pendingCount} colorClass={STATUS_COLORS.pending} />
        <SummaryCard
          label="処理中 (processing)"
          count={summary.processingCount}
          colorClass={hasStuckAlert ? "bg-red-50 border-red-400 text-red-800" : STATUS_COLORS.processing}
          warning={hasStuckAlert}
        />
        <SummaryCard label="失敗 (failed)" count={summary.failedCount} colorClass={STATUS_COLORS.failed} />
        <SummaryCard
          label="停止 (dead)"
          count={summary.deadCount}
          colorClass={hasDeadAlert ? "bg-red-900 border-red-700 text-white" : STATUS_COLORS.dead}
          warning={hasDeadAlert}
        />
        <SummaryCard label="送信済 (sent)" count={summary.sentCount} colorClass={STATUS_COLORS.sent} />
      </div>

      {/* stuck + recent errors */}
      <div className="text-xs text-gray-500 space-y-0.5">
        {summary.stuckProcessingCount > 0 && (
          <div className="text-red-600 font-medium">
            ⚠️ stuck processing: {summary.stuckProcessingCount} 件（recovery 推奨）
          </div>
        )}
        {summary.oldestPendingCreatedAt && (
          <div>最古 pending: {new Date(summary.oldestPendingCreatedAt).toLocaleString("ja-JP")}</div>
        )}
        {summary.oldestFailedCreatedAt && (
          <div>最古 failed: {new Date(summary.oldestFailedCreatedAt).toLocaleString("ja-JP")}</div>
        )}
      </div>

      {/* recent error samples */}
      {summary.recentErrorSamples.length > 0 && (
        <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
          <div className="text-xs font-semibold text-gray-600">直近のエラー（最大5件）</div>
          {summary.recentErrorSamples.map((s) => (
            <div key={s.id} className="text-xs text-gray-700 truncate">
              <span className="font-mono text-gray-500">#{s.id}</span>{" "}
              <span className="text-gray-600">{s.eventType}</span>:{" "}
              <span className="text-red-700">{s.lastError}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
