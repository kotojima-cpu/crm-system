"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const changed = searchParams.get("changed") === "1";
  const reset = searchParams.get("reset") === "1";
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      loginId,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("ログインIDまたはパスワードが正しくありません");
      return;
    }

    // サーバー側（page.tsx）でロール判定させるため、常に / へフルページリロード
    // / の Server Component が platform → /platform/tenants, tenant → /customers にリダイレクトする
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">OAフロント</h1>
          <p className="text-sm text-gray-500 mt-1">管理システムのログイン画面になります</p>
        </div>

        {changed && (
          <p className="text-sm text-green-700 bg-green-50 p-3 rounded-md mb-4">
            パスワードを変更しました。新しいパスワードでログインしてください。
          </p>
        )}

        {reset && (
          <p className="text-sm text-green-700 bg-green-50 p-3 rounded-md mb-4">
            パスワードを再設定しました。新しいパスワードでログインしてください。
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="loginId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ログインID
            </label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        <p className="text-center mt-4">
          <a href="/forgot-password" className="text-xs text-blue-600 hover:underline">
            パスワードを忘れた場合
          </a>
        </p>
        <p className="text-xs text-gray-400 text-center mt-4">株式会社ITフロンティア</p>
      </div>
    </div>
  );
}

import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
