"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  tenantId: number;
  status: string;
};

export function TenantStatusActions({ tenantId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const isSuspended = status === "suspended";
  const actionLabel = isSuspended ? "再開" : "停止";
  const endpoint = isSuspended
    ? `/api/platform/tenants/${tenantId}/resume`
    : `/api/platform/tenants/${tenantId}/suspend`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError(`${actionLabel}理由を入力してください`);
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message || `${actionLabel}に失敗しました`);
        return;
      }

      setShowForm(false);
      setReason("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">テナント状態管理</h2>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className={`px-4 py-2 text-sm rounded-md ${
            isSuspended
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-red-600 text-white hover:bg-red-700"
          }`}
        >
          テナントを{actionLabel}する
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{actionLabel}理由 *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`${actionLabel}理由を入力してください`}
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-sm rounded-md text-white disabled:opacity-50 ${
                isSuspended ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading ? "処理中..." : `${actionLabel}を実行`}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setReason(""); setError(""); }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
