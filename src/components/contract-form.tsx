"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ContractData = {
  contractNumber: string;
  productName: string;
  leaseCompanyName: string;
  contractStartDate: string;
  contractEndDate: string;
  contractMonths: string;
  monthlyFee: string;
  billingBaseDay: string;
  notes: string;
};

type Props = {
  mode: "create" | "edit";
  customerId: number;
  customerName: string;
  contractId?: number;
  initialData?: Partial<ContractData>;
};

const emptyData: ContractData = {
  contractNumber: "",
  productName: "",
  leaseCompanyName: "",
  contractStartDate: "",
  contractEndDate: "",
  contractMonths: "",
  monthlyFee: "",
  billingBaseDay: "",
  notes: "",
};

export function ContractForm({ mode, customerId, customerName, contractId, initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<ContractData>({ ...emptyData, ...initialData });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const set = (field: keyof ContractData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.productName.trim()) newErrors.productName = "商品名は必須です";
    if (!data.contractStartDate) newErrors.contractStartDate = "契約開始日は必須です";
    if (!data.contractEndDate) newErrors.contractEndDate = "契約終了日は必須です";
    if (!data.contractMonths || Number(data.contractMonths) <= 0)
      newErrors.contractMonths = "契約月数は1以上の整数で入力してください";
    if (data.contractStartDate && data.contractEndDate && data.contractStartDate >= data.contractEndDate)
      newErrors.contractEndDate = "契約終了日は開始日より後にしてください";
    if (data.billingBaseDay) {
      const day = Number(data.billingBaseDay);
      if (isNaN(day) || day < 1 || day > 28)
        newErrors.billingBaseDay = "1〜28の範囲で入力してください";
    }
    if (data.monthlyFee && Number(data.monthlyFee) < 0)
      newErrors.monthlyFee = "0以上の金額を入力してください";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setLoading(true);
    const url = mode === "create" ? "/api/contracts" : `/api/contracts/${contractId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const payload: Record<string, unknown> = {
      productName: data.productName.trim(),
      leaseCompanyName: data.leaseCompanyName.trim() || null,
      contractStartDate: data.contractStartDate,
      contractEndDate: data.contractEndDate,
      contractMonths: Number(data.contractMonths),
      monthlyFee: data.monthlyFee ? Number(data.monthlyFee) : null,
      billingBaseDay: data.billingBaseDay ? Number(data.billingBaseDay) : null,
      contractNumber: data.contractNumber.trim() || null,
      notes: data.notes.trim() || null,
    };
    if (mode === "create") payload.customerId = customerId;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (res.ok) {
      if (mode === "create") {
        router.push(`/customers/${customerId}`);
      } else {
        router.push(`/contracts/${contractId}`);
      }
      router.refresh();
    } else {
      const result = await res.json();
      setServerError(result.error?.message || "保存に失敗しました");
    }
  };

  const backUrl = mode === "create" ? `/customers/${customerId}` : `/contracts/${contractId}`;

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">顧客: {customerName}</p>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md">{serverError}</div>
      )}

      <div className="space-y-4">
        <Field label="契約番号">
          <input type="text" value={data.contractNumber} onChange={set("contractNumber")}
            placeholder="LC-2025-001" className={inputClass()} />
        </Field>

        <Field label="商品名" required error={errors.productName}>
          <input type="text" value={data.productName} onChange={set("productName")}
            placeholder="Canon iR-ADV C5560" className={inputClass(errors.productName)} />
        </Field>

        <Field label="リース会社">
          <input type="text" value={data.leaseCompanyName} onChange={set("leaseCompanyName")}
            placeholder="オリックス" className={inputClass()} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="契約開始日" required error={errors.contractStartDate}>
            <input type="date" value={data.contractStartDate} onChange={set("contractStartDate")}
              className={inputClass(errors.contractStartDate)} />
          </Field>
          <Field label="契約終了日" required error={errors.contractEndDate}>
            <input type="date" value={data.contractEndDate} onChange={set("contractEndDate")}
              className={inputClass(errors.contractEndDate)} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="契約月数" required error={errors.contractMonths}>
            <input type="number" value={data.contractMonths} onChange={set("contractMonths")}
              min="1" placeholder="60" className={inputClass(errors.contractMonths)} />
          </Field>
          <Field label="月額（円）" error={errors.monthlyFee}>
            <input type="number" value={data.monthlyFee} onChange={set("monthlyFee")}
              min="0" placeholder="45000" className={inputClass(errors.monthlyFee)} />
          </Field>
          <Field label="更新基準日" error={errors.billingBaseDay}>
            <input type="number" value={data.billingBaseDay} onChange={set("billingBaseDay")}
              min="1" max="28" placeholder="1" className={inputClass(errors.billingBaseDay)} />
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
        <button type="button" onClick={() => router.push(backUrl)}
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
