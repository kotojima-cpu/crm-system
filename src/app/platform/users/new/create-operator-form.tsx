"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateOperatorForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ loginId: string; name: string } | null>(null);

  const [form, setForm] = useState({
    loginId: "",
    password: "",
    name: "",
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/platform/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error?.details) {
          const errs: Record<string, string> = {};
          for (const d of json.error.details) {
            errs[d.field] = d.message;
          }
          setFieldErrors(errs);
        }
        setError(json.error?.message || "作成に失敗しました");
        return;
      }

      setSuccess({ loginId: json.data.loginId, name: json.data.name });
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <h2 className="text-green-800 font-semibold">親担当者を作成しました</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">名前</dt>
              <dd className="font-medium">{success.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">ログインID</dt>
              <dd className="font-mono font-medium">{success.loginId}</dd>
            </div>
            <div>
              <dt className="text-gray-500">権限</dt>
              <dd>親担当者（子管理者アカウントの作成・停止）</dd>
            </div>
            <div>
              <dt className="text-gray-500">初期パスワード</dt>
              <dd className="font-mono font-medium text-amber-700">
                入力したパスワードでログインできます
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/platform/users")}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            親担当者一覧へ戻る
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ loginId: "", password: "", name: "" });
            }}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            続けて作成
          </button>
        </div>
      </div>
    );
  }

  const inputClass = (field: string) =>
    `w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      fieldErrors[field] ? "border-red-300" : "border-gray-300"
    }`;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">名前 *</label>
        <input
          type="text"
          value={form.name}
          onChange={set("name")}
          placeholder="例: 運営 太郎"
          className={inputClass("name")}
          required
        />
        {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">ログインID *</label>
        <input
          type="text"
          value={form.loginId}
          onChange={set("loginId")}
          placeholder="例: op-tanaka"
          autoComplete="off"
          className={inputClass("loginId")}
          required
        />
        <p className="text-xs text-gray-400 mt-1">半角英数字・ハイフン・アンダースコアのみ</p>
        {fieldErrors.loginId && <p className="text-xs text-red-600 mt-1">{fieldErrors.loginId}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">初期パスワード *</label>
        <input
          type="password"
          value={form.password}
          onChange={set("password")}
          placeholder="8文字以上"
          autoComplete="new-password"
          className={inputClass("password")}
          required
          minLength={8}
        />
        {fieldErrors.password && <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800">
        作成されるアカウントには「親担当者」権限が付与されます。
        子管理者アカウントの作成・停止のみが可能です。
        親管理者・他の親担当者の管理や、Outbox運用・契約者情報編集の権限は含まれません。
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "作成中..." : "親担当者を作成"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/platform/users")}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
