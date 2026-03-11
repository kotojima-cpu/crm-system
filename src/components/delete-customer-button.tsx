"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCustomerButton({ customerId, companyName }: { customerId: number; companyName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const res = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
    });
    setLoading(false);

    if (res.ok) {
      router.push("/customers");
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error?.message || "削除に失敗しました");
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-600">
          「{companyName}」を削除しますか？
        </span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "削除中..." : "削除する"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
        >
          キャンセル
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
    >
      削除
    </button>
  );
}
