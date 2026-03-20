"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  isOutboxRetryAllowed,
  isOutboxReplayAllowed,
  isOutboxForceReplayAllowed,
} from "@/features/platform-outbox/presenters";

interface Props {
  eventId: number;
  status: string;
}

export function OutboxActionButtons({ eventId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForceReplayForm, setShowForceReplayForm] = useState(false);
  const [forceReplayReason, setForceReplayReason] = useState("");

  async function post(path: string, body: Record<string, unknown> = {}) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleRetry() {
    setLoading("retry");
    setMessage(null);
    try {
      const res = await post(`/api/platform/outbox/${eventId}/retry`);
      if (res.ok) {
        setMessage("retry をキューに登録しました。");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setMessage(`エラー: ${json?.error?.message ?? res.status}`);
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleReplay() {
    setLoading("replay");
    setMessage(null);
    try {
      const res = await post(`/api/platform/outbox/${eventId}/replay`);
      if (res.ok) {
        setMessage("dead event を pending に戻しました。");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setMessage(`エラー: ${json?.error?.message ?? res.status}`);
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleForceReplay() {
    if (!forceReplayReason.trim()) return;

    setLoading("force-replay");
    setMessage(null);
    try {
      const res = await post(`/api/platform/outbox/${eventId}/force-replay`, {
        forceSentReplay: true,
        reason: forceReplayReason.trim(),
      });
      if (res.ok) {
        setMessage("force replay を実行しました（AuditLog に記録済み）。");
        setShowForceReplayForm(false);
        setForceReplayReason("");
        router.refresh();
      } else {
        const json = await res.json().catch(() => ({}));
        setMessage(`エラー: ${json?.error?.message ?? res.status}`);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isOutboxRetryAllowed(status) && (
          <button
            onClick={handleRetry}
            disabled={loading !== null}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === "retry" ? "処理中…" : "🔄 Retry"}
          </button>
        )}

        {isOutboxReplayAllowed(status) && (
          <button
            onClick={handleReplay}
            disabled={loading !== null}
            className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 disabled:opacity-50"
          >
            {loading === "replay" ? "処理中…" : "♻️ Replay (dead)"}
          </button>
        )}

        {isOutboxForceReplayAllowed(status) && !showForceReplayForm && (
          <button
            onClick={() => setShowForceReplayForm(true)}
            disabled={loading !== null}
            className="bg-red-700 text-white px-4 py-2 rounded text-sm hover:bg-red-800 disabled:opacity-50 border-2 border-red-900"
          >
            ⚠️ Force Replay（危険）
          </button>
        )}
      </div>

      {/* force replay: 理由入力フォーム */}
      {showForceReplayForm && (
        <div className="border-2 border-red-400 rounded-lg p-4 bg-red-50 space-y-3">
          <div className="text-sm font-semibold text-red-800">
            ⚠️ 危険操作: Force Replay
          </div>
          <div className="text-xs text-red-700">
            sent イベントを強制再実行します。冪等でない handler では二重送信が発生します。
            実行理由を必ず記録してください（AuditLog に保存されます）。
          </div>
          <div>
            <label className="block text-xs font-medium text-red-700 mb-1">
              実行理由 <span className="text-red-500">*必須</span>
            </label>
            <textarea
              value={forceReplayReason}
              onChange={(e) => setForceReplayReason(e.target.value)}
              placeholder="例: メール再送要求 (顧客からの連絡 #1234)"
              rows={2}
              className="border border-red-300 rounded px-2 py-1 w-full text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleForceReplay}
              disabled={loading !== null || !forceReplayReason.trim()}
              className="bg-red-700 text-white px-4 py-2 rounded text-sm hover:bg-red-800 disabled:opacity-50 border-2 border-red-900"
            >
              {loading === "force-replay" ? "実行中…" : "⚠️ 実行（理由記録済み）"}
            </button>
            <button
              onClick={() => { setShowForceReplayForm(false); setForceReplayReason(""); }}
              className="border rounded px-4 py-2 text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="text-sm text-gray-700 bg-gray-100 rounded px-3 py-2">{message}</div>
      )}
    </div>
  );
}
