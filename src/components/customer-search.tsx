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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (companyName.trim()) params.set("companyName", companyName.trim());
    if (address.trim()) params.set("address", address.trim());
    if (phone.trim()) params.set("phone", phone.trim());
    params.set("page", "1");
    router.push(`/customers?${params.toString()}`);
  };

  const handleClear = () => {
    setCompanyName("");
    setAddress("");
    setPhone("");
    router.push("/customers");
  };

  const hasFilters = companyName || address || phone;

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
