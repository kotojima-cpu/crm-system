"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecoverStuckEventsResult } from "@/features/platform-outbox-recovery/types";

interface RecoveryPanelResult {
  recovery: RecoverStuckEventsResult;
  healthCheck: {
    summary: { pendingCount: number; failedCount: number; deadCount: number; stuckProcessingCount: number };
    metricsPublished: boolean;
    notificationsSent: boolean;
  };
}

export function OutboxRecoveryPanel() {
  const router = useRouter();
  const [thresholdMinutes, setThresholdMinutes] = useState(15);
  const [limit, setLimit] = useState(100);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecoveryPanelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExecute() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/platform/outbox/recover-stuck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdMinutes, limit, dryRun }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? `HTTP ${res.status}`);
      } else {
        setResult(json.data);
        if (!dryRun) router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-white">
      <div className="font-semibold text-sm">Stuck Processing Recovery</div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            閾値（分）
          </label>
          <input
            type="number"
            min={1}
            max={1440}
            value={thresholdMinutes}
            onChange={(e) => setThresholdMinutes(parseInt(e.target.value) || 15)}
            className="border rounded px-2 py-1 w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            最大件数
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
            className="border rounded px-2 py-1 w-full text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="rounded"
        />
        <span>Dry Run（確認のみ、DB 更新なし）</span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={handleExecute}
          disabled={loading}
          className={`px-4 py-2 rounded text-sm text-white disabled:opacity-50 ${
            dryRun
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-orange-600 hover:bg-orange-700 border-2 border-orange-800"
          }`}
        >
          {loading ? "実行中…" : dryRun ? "対象確認（Dry Run）" : "⚠️ Recovery 実行"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          エラー: {error}
        </div>
      )}

      {result && (
        <div className="text-sm bg-gray-50 border rounded px-3 py-2 space-y-1">
          <div className="font-medium">
            {result.recovery.dryRun ? "Dry Run 結果" : "Recovery 結果"}
          </div>
          <div>対象 ({result.recovery.dryRun ? "対象候補" : "回収済"}): {result.recovery.dryRun ? result.recovery.recoveredIds.length : result.recovery.recoveredCount} 件</div>
          {!result.recovery.dryRun && (
            <>
              <div>スキップ: {result.recovery.skippedCount} 件</div>
              <div>Metrics: {result.healthCheck.metricsPublished ? "✓ 発行済" : "未発行"}</div>
              <div>通知: {result.healthCheck.notificationsSent ? "✓ 送信済" : "未送信"}</div>
            </>
          )}
          {result.recovery.recoveredIds.length > 0 && (
            <div className="text-xs text-gray-500">
              ID: {result.recovery.recoveredIds.slice(0, 10).join(", ")}
              {result.recovery.recoveredIds.length > 10 && " ..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
