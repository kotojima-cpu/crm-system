"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  tenantId: number;
  tenantName: string;
};

export function TenantDeleteButton({ tenantId, tenantName }: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("削除理由を入力してください");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message || "削除に失敗しました");
        return;
      }

      setShowConfirm(false);
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
      <h2 className="text-sm font-semibold text-gray-700 mb-3">テナント論理削除</h2>

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          このテナントを削除する
        </button>
      ) : (
        <form onSubmit={handleDelete} className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">「{tenantName}」を論理削除します。</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              <li>テナントは通常一覧から除外されます</li>
              <li>配下の顧客・契約・ユーザーデータは削除されません</li>
              <li>配下ユーザーはログインできなくなります</li>
              <li>通常の運用対象から外れます</li>
            </ul>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">削除理由 *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="削除理由を入力してください"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "処理中..." : "削除を実行"}
            </button>
            <button
              type="button"
              onClick={() => { setShowConfirm(false); setReason(""); setError(""); }}
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
