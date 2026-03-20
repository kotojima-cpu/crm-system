"use client";

import { useState } from "react";
import type { OutboxHealthCheckResult } from "@/features/platform-outbox/types";

type HealthCheckState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: OutboxHealthCheckResult }
  | { phase: "error"; message: string };

function StatusBadge({ status }: { status: "healthy" | "warning" | "critical" }) {
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

export function OutboxHealthCheckPanel() {
  const [state, setState] = useState<HealthCheckState>({ phase: "idle" });

  async function runHealthCheck() {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/platform/outbox/health-check", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ phase: "error", message: body?.error?.message ?? `HTTP ${res.status}` });
        return;
      }
      const body = await res.json();
      setState({ phase: "done", result: body.data });
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "不明なエラー" });
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Health Check</h3>
        <button
          onClick={runHealthCheck}
          disabled={state.phase === "loading"}
          className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          {state.phase === "loading" ? "実行中…" : "Health Check 実行"}
        </button>
      </div>

      {state.phase === "error" && (
        <p className="text-xs text-red-600">{state.message}</p>
      )}

      {state.phase === "done" && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-gray-500">ステータス</dt>
          <dd><StatusBadge status={state.result.status} /></dd>

          <dt className="text-gray-500">Metrics 発行</dt>
          <dd>{state.result.metricsPublished ? "済" : "未"}</dd>

          <dt className="text-gray-500">通知送信</dt>
          <dd>{state.result.notificationsSent ? "済" : "未"}</dd>

          <dt className="text-gray-500">Cooldown 抑制</dt>
          <dd>{state.result.suppressedByCooldown ? "あり" : "なし"}</dd>

          {state.result.alerts.length > 0 && (
            <>
              <dt className="text-gray-500 col-span-2 mt-1">アラート</dt>
              {state.result.alerts.map((a) => (
                <dd key={a.code} className="col-span-2 text-orange-700">
                  {a.code}: {a.count}件
                </dd>
              ))}
            </>
          )}
        </dl>
      )}
    </div>
  );
}
