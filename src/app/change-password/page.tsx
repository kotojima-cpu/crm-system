"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }

    if (newPassword.length < 8) {
      setError("新しいパスワードは8文字以上で入力してください");
      return;
    }

    if (currentPassword === newPassword) {
      setError("新しいパスワードは現在のパスワードと異なるものにしてください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "パスワード変更に失敗しました");
        return;
      }

      // 成功表示 → 5秒後にセッション破棄してログイン画面へ
      setSuccess(true);
      setTimeout(async () => {
        await signOut({ redirect: false });
        window.location.href = "/login?changed=1";
      }, 5000);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // 成功画面
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md text-center">
          <div className="text-green-600 text-4xl mb-4">&#10003;</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">パスワードを変更しました</h1>
          <p className="text-sm text-gray-500">
            安全のため、ログイン画面へ移動します。
          </p>
          <p className="text-sm text-gray-500 mt-1">
            新しいパスワードで再度ログインしてください。
          </p>
          <p className="text-xs text-gray-400 mt-4">5秒後に自動的に移動します...</p>
          <button
            onClick={async () => {
              await signOut({ redirect: false });
              window.location.href = "/login?changed=1";
            }}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            ログイン画面へ戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-800">パスワード変更</h1>
          <p className="text-sm text-gray-500 mt-1">
            初回ログインのため、パスワードを変更してください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              現在のパスワード
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              新しいパスワード（8文字以上）
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              新しいパスワード（確認）
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "変更中..." : "パスワードを変更"}
          </button>
        </form>
      </div>
    </div>
  );
}
