"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [loginId, setLoginId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "エラーが発生しました");
        return;
      }

      setSent(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-800">パスワード再設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            ログインIDを入力してください。登録済みメールアドレスに再設定URLを送信します。
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 p-4 rounded-md">
              登録済みメールアドレスに再設定URLを送信しました。メールをご確認ください。
              URLの有効期限は30分です。
            </p>
            <div className="text-center">
              <Link href="/login" className="text-sm text-blue-600 hover:underline">
                ログイン画面に戻る
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="loginId" className="block text-sm font-medium text-gray-700 mb-1">
                ログインID
              </label>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
                autoComplete="username"
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
              {loading ? "送信中..." : "再設定メールを送信"}
            </button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-gray-500 hover:underline">
                ログイン画面に戻る
              </Link>
            </div>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">株式会社ITフロンティア</p>
      </div>
    </div>
  );
}
