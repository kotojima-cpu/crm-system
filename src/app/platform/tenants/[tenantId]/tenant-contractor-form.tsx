"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PREFECTURES } from "@/lib/prefectures";

type ContractorData = {
  contractorName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  contactMobile: string;
  prefecture: string;
};

type Props = {
  tenantId: number;
  initialData: ContractorData;
};

export function TenantContractorForm({ tenantId, initialData }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ContractorData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof ContractorData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: "PATCH",
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
        setError(json.error?.message || "更新に失敗しました");
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      fieldErrors[field] ? "border-red-300" : "border-gray-300"
    }`;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">契約者情報</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-md">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 p-2 rounded-md">契約者情報を更新しました</p>}

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

        <div className="pt-2">
          <button type="submit" disabled={loading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {loading ? "更新中..." : "契約者情報を更新"}
          </button>
        </div>
      </form>
    </div>
  );
}
