import type { ReactNode } from "react";
import type { PlatformHistoryDashboardSummary } from "@/features/platform-history-dashboard";
import type { HealthCheckStatus } from "@/features/platform-health-history";

function StatCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

const HEALTH_STATUS_LABEL: Record<string, string> = {
  healthy: "正常",
  warning: "注意",
  critical: "異常",
  unknown: "未判定",
};

function HealthStatusBadge({ status }: { status: HealthCheckStatus | "unknown" }) {
  const classes: Record<string, string> = {
    healthy: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes[status] ?? classes.unknown}`}>
      {HEALTH_STATUS_LABEL[status] ?? status}
    </span>
  );
}

interface Props {
  summary: PlatformHistoryDashboardSummary;
}

export function OutboxHistoryDashboardCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        label="アラート履歴（総件数）"
        value={summary.alertHistoryCount.toLocaleString()}
      />
      <StatCard
        label="健全性確認履歴（総件数）"
        value={summary.healthHistoryCount.toLocaleString()}
      />
      <StatCard
        label="Webhook アラート送信数"
        value={summary.webhookAlertCount.toLocaleString()}
      />
      <StatCard
        label="メール アラート送信数"
        value={summary.mailAlertCount.toLocaleString()}
      />
      <StatCard
        label="連続通知抑制された確認数"
        value={summary.suppressedHealthCheckCount.toLocaleString()}
      />
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-2xl font-semibold">
          <HealthStatusBadge status={summary.latestHealthStatus} />
        </div>
        <div className="text-xs text-gray-500 mt-1">最新の健全性ステータス</div>
        {summary.latestHealthCheckAt && (
          <div className="text-xs text-gray-400 mt-1">
            {summary.latestHealthCheckAt.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
