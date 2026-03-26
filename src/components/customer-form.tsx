"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { PREFECTURES } from "@/lib/prefectures";

type CustomerData = {
  customerType: string;
  companyName: string;
  companyNameKana: string;
  zipCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  fax: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
  assignedUserId: string;
};

type AssigneeOption = { id: number; name: string };

type Props = {
  mode: "create" | "edit";
  customerId?: number;
  initialData?: Partial<CustomerData>;
  /** tenant_admin の場合のみ担当者候補を渡す */
  assigneeOptions?: AssigneeOption[];
};

const emptyData: CustomerData = {
  customerType: "new",
  companyName: "",
  companyNameKana: "",
  zipCode: "",
  prefecture: "",
  city: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  fax: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
  assignedUserId: "",
};

export function CustomerForm({ mode, customerId, initialData, assigneeOptions }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CustomerData>({ ...emptyData, ...initialData });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [postalSearching, setPostalSearching] = useState(false);
  const [postalMessage, setPostalMessage] = useState("");

  const set = (field: keyof CustomerData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setData((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  // 郵便番号→住所自動検索
  const searchPostalCode = useCallback(async (zipCode: string) => {
    const normalized = zipCode.replace(/-/g, "");
    if (!/^\d{7}$/.test(normalized)) return;

    setPostalSearching(true);
    setPostalMessage("");
    try {
      const res = await fetch(`/api/postal-code?zipCode=${normalized}`);
      const json = await res.json();
      if (json.data?.results?.length > 0) {
        const r = json.data.results[0];
        setData((prev) => ({
          ...prev,
          prefecture: r.prefecture || prev.prefecture,
          city: r.city || prev.city,
          addressLine1: r.town || prev.addressLine1,
        }));
        setPostalMessage("");
      } else {
        setPostalMessage("該当する住所が見つかりませんでした。手入力してください。");
      }
    } catch {
      setPostalMessage("住所検索に失敗しました。手入力してください。");
    } finally {
      setPostalSearching(false);
    }
  }, []);

  // 郵便番号入力時の自動検索
  const handleZipCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setData((prev) => ({ ...prev, zipCode: value }));
    setErrors((prev) => ({ ...prev, zipCode: "" }));
    // 7桁入力で自動検索
    const normalized = value.replace(/-/g, "");
    if (/^\d{7}$/.test(normalized)) {
      searchPostalCode(value);
    }
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

    // assignedUserId は edit + assigneeOptions がある場合のみ送信
    const payload: Record<string, unknown> = { ...data };
    if (mode === "edit" && assigneeOptions && data.assignedUserId) {
      payload.assignedUserId = Number(data.assignedUserId);
    } else {
      delete payload.assignedUserId;
    }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">登録種別 <span className="text-red-500">*</span></label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="customerType" value="new"
                checked={data.customerType === "new"}
                onChange={() => setData((prev) => ({ ...prev, customerType: "new" }))}
                className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">新規顧客</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="customerType" value="prospect"
                checked={data.customerType === "prospect"}
                onChange={() => setData((prev) => ({ ...prev, customerType: "prospect" }))}
                className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-700">見込顧客</span>
            </label>
          </div>
          {data.customerType === "prospect" && (
            <p className="text-xs text-amber-600 mt-1">見込顧客はリース契約を追加できません</p>
          )}
        </div>

        <Field label="会社名" required error={errors.companyName}>
          <input type="text" value={data.companyName} onChange={set("companyName")}
            className={inputClass(errors.companyName)} />
        </Field>

        <Field label="会社名カナ">
          <input type="text" value={data.companyNameKana} onChange={set("companyNameKana")}
            placeholder="カブシキガイシャ" className={inputClass()} />
        </Field>

        <hr className="my-4" />
        <p className="text-sm font-medium text-gray-700">住所情報</p>

        <div className="grid grid-cols-2 gap-4">
          <Field label="郵便番号" error={errors.zipCode}>
            <div className="flex gap-2">
              <input type="text" value={data.zipCode} onChange={handleZipCodeChange}
                placeholder="123-4567" className={inputClass(errors.zipCode)} />
              <button type="button" onClick={() => searchPostalCode(data.zipCode)}
                disabled={postalSearching || !data.zipCode}
                className="px-3 py-2 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                {postalSearching ? "検索中..." : "住所検索"}
              </button>
            </div>
            {postalMessage && <p className="text-xs text-amber-600 mt-1">{postalMessage}</p>}
          </Field>
          <div></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="都道府県">
            <select value={data.prefecture} onChange={set("prefecture")} className={inputClass()}>
              <option value="">選択してください</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="市区町村">
            <input type="text" value={data.city} onChange={set("city")}
              placeholder="例: 千代田区" className={inputClass()} />
          </Field>
        </div>

        <Field label="町域・番地">
          <input type="text" value={data.addressLine1} onChange={set("addressLine1")}
            placeholder="例: 丸の内1-1-1" className={inputClass()} />
        </Field>

        <Field label="建物名・部屋番号">
          <input type="text" value={data.addressLine2} onChange={set("addressLine2")}
            placeholder="例: ○○ビル 5F" className={inputClass()} />
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

        {mode === "edit" && assigneeOptions && assigneeOptions.length > 0 && (
          <>
            <hr className="my-4" />
            <p className="text-sm font-medium text-gray-700">担当者変更</p>
            <Field label="担当者">
              <select
                value={data.assignedUserId}
                onChange={(e) => setData((prev) => ({ ...prev, assignedUserId: e.target.value }))}
                className={inputClass()}
              >
                <option value="">未割当</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={String(u.id)}>{u.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}

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
