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

function HealthStatusBadge({ status }: { status: HealthCheckStatus | "unknown" }) {
  const classes: Record<string, string> = {
    healthy: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
    unknown: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes[status] ?? classes.unknown}`}>
      {status}
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
        label="アラート履歴 (総件数)"
        value={summary.alertHistoryCount.toLocaleString()}
      />
      <StatCard
        label="Health Check 履歴 (総件数)"
        value={summary.healthHistoryCount.toLocaleString()}
      />
      <StatCard
        label="Webhook アラート送信数"
        value={summary.webhookAlertCount.toLocaleString()}
      />
      <StatCard
        label="Mail アラート送信数"
        value={summary.mailAlertCount.toLocaleString()}
      />
      <StatCard
        label="Cooldown 抑制 Health Check 数"
        value={summary.suppressedHealthCheckCount.toLocaleString()}
      />
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-2xl font-semibold">
          <HealthStatusBadge status={summary.latestHealthStatus} />
        </div>
        <div className="text-xs text-gray-500 mt-1">最新 Health ステータス</div>
        {summary.latestHealthCheckAt && (
          <div className="text-xs text-gray-400 mt-1">
            {summary.latestHealthCheckAt.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
