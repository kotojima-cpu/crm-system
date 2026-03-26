"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetPasswordButton({ userId, loginId }: { userId: number; loginId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.length < 8) {
      setError("仮パスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/platform/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        setError("サーバーからの応答を解析できませんでした");
        return;
      }
      if (!res.ok) {
        setError(data.error || "再発行に失敗しました");
        return;
      }
      setSuccess("仮パスワードを設定しました。対象者に安全な方法でお伝えください。");
      setNewPassword("");
      setTimeout(() => {
        setOpen(false);
        setSuccess("");
        router.refresh();
      }, 3000);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-orange-600 hover:underline"
      >
        PW再発行
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm space-y-4">
        <h3 className="font-semibold text-gray-800">パスワード再発行</h3>
        <p className="text-sm text-gray-600">
          <span className="font-medium">{loginId}</span> の仮パスワードを設定します。<br />
          対象者は次回ログイン時にパスワード変更が必要になります。
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            仮パスワード（8文字以上）
          </label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="仮パスワードを入力"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setOpen(false); setNewPassword(""); setError(""); setSuccess(""); }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "処理中..." : "再発行する"}
          </button>
        </div>
      </div>
    </div>
  );
}
