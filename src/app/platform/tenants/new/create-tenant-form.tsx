"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PREFECTURES } from "@/lib/prefectures";

export function CreateTenantForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    tenantName: string;
    adminLoginId: string;
  } | null>(null);

  const [form, setForm] = useState({
    tenantName: "",
    adminName: "",
    adminLoginId: "",
    adminPassword: "",
    contractorName: "",
    contactPerson: "",
    contactEmail: "",
    contactPhone: "",
    contactMobile: "",
    prefecture: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/platform/tenants", {
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

      setSuccess({
        tenantName: json.data.tenant.name,
        adminLoginId: json.data.adminUser.loginId,
      });
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
          <h2 className="text-green-800 font-semibold">テナントを作成しました</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">テナント名</dt>
              <dd className="font-medium">{success.tenantName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">管理者ログインID</dt>
              <dd className="font-mono font-medium">{success.adminLoginId}</dd>
            </div>
            <div>
              <dt className="text-gray-500">初期パスワード</dt>
              <dd className="font-mono font-medium text-amber-700">
                入力したパスワードでログインできます（この画面を閉じると再表示できません）
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/platform/tenants")}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            テナント一覧へ戻る
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ tenantName: "", adminName: "", adminLoginId: "", adminPassword: "", contractorName: "", contactPerson: "", contactEmail: "", contactPhone: "", contactMobile: "", prefecture: "" });
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

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 mb-2">テナント情報</legend>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">テナント名 *</label>
          <input type="text" value={form.tenantName} onChange={set("tenantName")}
            placeholder="例: 株式会社ABC" className={inputClass("tenantName")} required />
          {fieldErrors.tenantName && <p className="text-xs text-red-600 mt-1">{fieldErrors.tenantName}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 mb-2">初期管理者アカウント</legend>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">管理者名 *</label>
          <input type="text" value={form.adminName} onChange={set("adminName")}
            placeholder="例: 田中太郎" className={inputClass("adminName")} required />
          {fieldErrors.adminName && <p className="text-xs text-red-600 mt-1">{fieldErrors.adminName}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">ログインID *</label>
          <input type="text" value={form.adminLoginId} onChange={set("adminLoginId")}
            placeholder="例: abc-admin" autoComplete="off"
            className={inputClass("adminLoginId")} required />
          <p className="text-xs text-gray-400 mt-1">半角英数字・ハイフン・アンダースコアのみ</p>
          {fieldErrors.adminLoginId && <p className="text-xs text-red-600 mt-1">{fieldErrors.adminLoginId}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">初期パスワード *</label>
          <input type="password" value={form.adminPassword} onChange={set("adminPassword")}
            placeholder="8文字以上" autoComplete="new-password"
            className={inputClass("adminPassword")} required minLength={8} />
          {fieldErrors.adminPassword && <p className="text-xs text-red-600 mt-1">{fieldErrors.adminPassword}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 mb-2">契約者情報（任意）</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">契約者会社名</label>
            <input type="text" value={form.contractorName} onChange={set("contractorName")}
              className={inputClass("contractorName")} />
            {fieldErrors.contractorName && <p className="text-xs text-red-600 mt-1">{fieldErrors.contractorName}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">管理者氏名</label>
            <input type="text" value={form.contactPerson} onChange={set("contactPerson")}
              className={inputClass("contactPerson")} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">メールアドレス</label>
            <input type="email" value={form.contactEmail} onChange={set("contactEmail")}
              className={inputClass("contactEmail")} />
            {fieldErrors.contactEmail && <p className="text-xs text-red-600 mt-1">{fieldErrors.contactEmail}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">都道府県</label>
            <select value={form.prefecture} onChange={set("prefecture")}
              className={inputClass("prefecture")}>
              <option value="">選択してください</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {fieldErrors.prefecture && <p className="text-xs text-red-600 mt-1">{fieldErrors.prefecture}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">TEL</label>
            <input type="text" value={form.contactPhone} onChange={set("contactPhone")}
              placeholder="03-1234-5678" className={inputClass("contactPhone")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">携帯番号</label>
            <input type="text" value={form.contactMobile} onChange={set("contactMobile")}
              placeholder="090-1234-5678" className={inputClass("contactMobile")} />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? "作成中..." : "テナントを作成"}
        </button>
        <button type="button" onClick={() => router.push("/platform/tenants")}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
          キャンセル
        </button>
      </div>
    </form>
  );
}
