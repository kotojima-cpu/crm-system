"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CustomerData = {
  companyName: string;
  companyNameKana: string;
  zipCode: string;
  address: string;
  phone: string;
  fax: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
};

type Props = {
  mode: "create" | "edit";
  customerId?: number;
  initialData?: Partial<CustomerData>;
};

const emptyData: CustomerData = {
  companyName: "",
  companyNameKana: "",
  zipCode: "",
  address: "",
  phone: "",
  fax: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};

export function CustomerForm({ mode, customerId, initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CustomerData>({ ...emptyData, ...initialData });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const set = (field: keyof CustomerData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.companyName.trim()) newErrors.companyName = "会社名は必須です";
    else if (data.companyName.length > 200) newErrors.companyName = "200文字以内で入力してください";

    if (data.zipCode && !/^\d{3}-?\d{4}$/.test(data.zipCode))
      newErrors.zipCode = "郵便番号の形式が不正です（例: 123-4567）";

    if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail))
      newErrors.contactEmail = "メールアドレスの形式が不正です";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setLoading(true);
    const url = mode === "create" ? "/api/customers" : `/api/customers/${customerId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setLoading(false);

    if (res.ok) {
      const result = await res.json();
      const id = mode === "create" ? result.data.id : customerId;
      router.push(`/customers/${id}`);
      router.refresh();
    } else {
      const result = await res.json();
      setServerError(result.error?.message || "保存に失敗しました");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-2xl">
      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <Field label="会社名" required error={errors.companyName}>
          <input type="text" value={data.companyName} onChange={set("companyName")}
            className={inputClass(errors.companyName)} />
        </Field>

        <Field label="会社名カナ">
          <input type="text" value={data.companyNameKana} onChange={set("companyNameKana")}
            placeholder="カブシキガイシャ" className={inputClass()} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="郵便番号" error={errors.zipCode}>
            <input type="text" value={data.zipCode} onChange={set("zipCode")}
              placeholder="123-4567" className={inputClass(errors.zipCode)} />
          </Field>
          <div></div>
        </div>

        <Field label="住所">
          <input type="text" value={data.address} onChange={set("address")} className={inputClass()} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="電話番号">
            <input type="text" value={data.phone} onChange={set("phone")}
              placeholder="03-1234-5678" className={inputClass()} />
          </Field>
          <Field label="FAX番号">
            <input type="text" value={data.fax} onChange={set("fax")}
              placeholder="03-1234-5679" className={inputClass()} />
          </Field>
        </div>

        <hr className="my-4" />
        <p className="text-sm font-medium text-gray-700">担当者情報</p>

        <Field label="担当者名">
          <input type="text" value={data.contactName} onChange={set("contactName")} className={inputClass()} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="担当者電話番号">
            <input type="text" value={data.contactPhone} onChange={set("contactPhone")} className={inputClass()} />
          </Field>
          <Field label="担当者メール" error={errors.contactEmail}>
            <input type="text" value={data.contactEmail} onChange={set("contactEmail")} className={inputClass(errors.contactEmail)} />
          </Field>
        </div>

        <Field label="備考">
          <textarea value={data.notes} onChange={set("notes")} rows={3} className={inputClass()} />
        </Field>
      </div>

      <div className="flex gap-3 mt-6">
        <button type="submit" disabled={loading}
          className="px-6 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
          {loading ? "保存中..." : mode === "create" ? "登録" : "更新"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50">
          キャンセル
        </button>
      </div>
    </form>
  );
}

function inputClass(error?: string) {
  return `w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? "border-red-400" : "border-gray-300"
  }`;
}

function Field({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
