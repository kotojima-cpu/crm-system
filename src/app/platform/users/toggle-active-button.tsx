"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ToggleActiveButton({
  userId,
  isActive,
}: {
  userId: number;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const action = isActive ? "停止" : "有効化";
    if (!confirm(`この親担当者を${action}しますか？`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/platform/users/${userId}/toggle-active`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error?.message || `${action}に失敗しました`);
        return;
      }
      router.refresh();
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-xs px-3 py-1 rounded-md border ${
        isActive
          ? "border-red-300 text-red-600 hover:bg-red-50"
          : "border-green-300 text-green-600 hover:bg-green-50"
      } disabled:opacity-50`}
    >
      {loading ? "処理中..." : isActive ? "停止" : "有効化"}
    </button>
  );
}
