"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  isMaster: boolean;
  initialData: {
    name: string;
    email: string;
    phone: string;
  };
};

export function ProfileForm({ isMaster, initialData }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initialData);
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const emailOrPhoneChanged =
    form.email !== initialData.email || form.phone !== initialData.phone;
  const nameChanged = form.name !== initialData.name;
  const hasChanges = emailOrPhoneChanged || nameChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!hasChanges) {
      setError("変更する項目がありません");
      return;
    }

    if (emailOrPhoneChanged && !currentPassword) {
      setError("メールアドレスまたは電話番号の変更にはパスワードの再入力が必要です");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (nameChanged && isMaster) payload.name = form.name;
      if (form.email !== initialData.email) payload.email = form.email;
      if (form.phone !== initialData.phone) payload.phone = form.phone;
      if (emailOrPhoneChanged) payload.currentPassword = currentPassword;

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "更新に失敗しました");
        return;
      }

      setSuccess("プロフィールを更新しました");
      setCurrentPassword("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
  const readonlyClass = "w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-600";

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-700">本人情報の編集</h2>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</p>}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          氏名 {isMaster ? "" : "（変更不可）"}
        </label>
        {isMaster ? (
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className={inputClass}
            required
          />
        ) : (
          <input type="text" value={form.name} readOnly className={readonlyClass} />
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          className={inputClass}
          placeholder="example@mail.com"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">電話番号</label>
        <input
          type="text"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          className={inputClass}
          placeholder="090-1234-5678"
        />
      </div>

      {emailOrPhoneChanged && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
          <label className="block text-xs font-medium text-amber-800 mb-1">
            現在のパスワード（メール/電話番号変更時は必須）
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
            autoComplete="current-password"
            required
          />
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || !hasChanges}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "更新中..." : "更新する"}
        </button>
      </div>
    </form>
  );
}
