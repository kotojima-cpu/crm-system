"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformHistoryCleanupResult } from "@/features/platform-history-maintenance";

type CleanupState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: PlatformHistoryCleanupResult }
  | { phase: "error"; message: string };

export function OutboxHistoryCleanupPanel() {
  const router = useRouter();
  const [retentionDays, setRetentionDays] = useState(30);
  const [state, setState] = useState<CleanupState>({ phase: "idle" });

  async function runCleanup() {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/platform/outbox/history-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ phase: "error", message: body?.error?.message ?? `HTTP ${res.status}` });
        return;
      }
      setState({ phase: "done", result: body.data });
      router.refresh();
    } catch (err) {
      setState({ phase: "error", message: err instanceof Error ? err.message : "不明なエラー" });
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">履歴 Cleanup</h3>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-600 whitespace-nowrap">
          保持日数 (retentionDays)
        </label>
        <input
          type="number"
          min={1}
          max={365}
          value={retentionDays}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          className="w-20 border rounded px-2 py-1 text-xs"
        />
        <button
          onClick={runCleanup}
          disabled={state.phase === "loading"}
          className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          {state.phase === "loading" ? "実行中…" : "履歴 Cleanup 実行"}
        </button>
      </div>

      {state.phase === "error" && (
        <p className="text-xs text-red-600">{state.message}</p>
      )}

      {state.phase === "done" && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-gray-500">アラート履歴 削除件数</dt>
          <dd>{state.result.alertHistoryDeletedCount.toLocaleString()}</dd>

          <dt className="text-gray-500">Health Check 履歴 削除件数</dt>
          <dd>{state.result.healthHistoryDeletedCount.toLocaleString()}</dd>

          <dt className="text-gray-500">保持日数</dt>
          <dd>{state.result.retentionDays} 日</dd>
        </dl>
      )}
    </div>
  );
}
