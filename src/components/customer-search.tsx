"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function CustomerSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companyName, setCompanyName] = useState(
    searchParams.get("companyName") || ""
  );
  const [address, setAddress] = useState(searchParams.get("address") || "");
  const [phone, setPhone] = useState(searchParams.get("phone") || "");
  const [customerType, setCustomerType] = useState(searchParams.get("customerType") || "");
  const [remainingMonths, setRemainingMonths] = useState(searchParams.get("remainingMonths") || "");
  const [remainingMonthsOp, setRemainingMonthsOp] = useState(searchParams.get("remainingMonthsOp") || "lte");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (companyName.trim()) params.set("companyName", companyName.trim());
    if (address.trim()) params.set("address", address.trim());
    if (phone.trim()) params.set("phone", phone.trim());
    if (customerType) params.set("customerType", customerType);
    if (remainingMonths.trim()) {
      params.set("remainingMonths", remainingMonths.trim());
      params.set("remainingMonthsOp", remainingMonthsOp);
    }
    params.set("page", "1");
    router.push(`/customers?${params.toString()}`);
  };

  const handleClear = () => {
    setCompanyName("");
    setAddress("");
    setPhone("");
    setCustomerType("");
    setRemainingMonths("");
    setRemainingMonthsOp("lte");
    router.push("/customers");
  };

  const hasFilters = companyName || address || phone || customerType || remainingMonths;

  return (
    <form onSubmit={handleSearch} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            顧客名
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="会社名で検索"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            住所
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="住所で検索"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            電話番号
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="電話番号で検索（ハイフン可）"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            顧客種別
          </label>
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">すべて</option>
            <option value="new">新規顧客</option>
            <option value="prospect">見込顧客</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            リース残回数
          </label>
          <div className="flex gap-1">
            <select
              value={remainingMonthsOp}
              onChange={(e) => setRemainingMonthsOp(e.target.value)}
              className="px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="lte">以下</option>
              <option value="gte">以上</option>
              <option value="eq">一致</option>
            </select>
            <input
              type="number"
              min="0"
              value={remainingMonths}
              onChange={(e) => setRemainingMonths(e.target.value)}
              placeholder="回"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          検索
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
          >
            クリア
          </button>
        )}
      </div>
    </form>
  );
}
