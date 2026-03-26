"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-4">無効なURL</h1>
          <p className="text-sm text-gray-600 mb-4">
            再設定URLが無効です。もう一度パスワード再設定を行ってください。
          </p>
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
            パスワード再設定へ
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("確認パスワードが一致しません。");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "再設定に失敗しました。");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/login?reset=1";
      }, 3000);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md text-center">
          <h1 className="text-xl font-bold text-green-700 mb-4">パスワードを再設定しました</h1>
          <p className="text-sm text-gray-600 mb-4">
            新しいパスワードでログインしてください。3秒後にログイン画面へ移動します。
          </p>
          <Link
            href="/login?reset=1"
            className="text-sm text-blue-600 hover:underline"
          >
            ログイン画面へ
          </Link>
          <p className="text-xs text-gray-400 mt-6">株式会社ITフロンティア</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-800">新しいパスワードの設定</h1>
          <p className="text-sm text-gray-500 mt-1">新しいパスワードを入力してください。</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              新しいパスワード
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">8文字以上</p>
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
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "設定中..." : "パスワードを再設定"}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-sm text-gray-500 hover:underline">
              ログイン画面に戻る
            </Link>
          </div>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">株式会社ITフロンティア</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
