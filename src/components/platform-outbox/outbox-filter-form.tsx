"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "全て" },
  { value: "pending", label: "待機中 (pending)" },
  { value: "processing", label: "処理中 (processing)" },
  { value: "failed", label: "失敗 (failed)" },
  { value: "dead", label: "停止 (dead)" },
  { value: "sent", label: "送信済 (sent)" },
];

export function OutboxFilterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [eventType, setEventType] = useState(searchParams.get("eventType") ?? "");
  const [executionMode, setExecutionMode] = useState(searchParams.get("executionMode") ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (eventType) params.set("eventType", eventType);
    if (executionMode) params.set("executionMode", executionMode);
    params.set("offset", "0");
    router.push(`?${params.toString()}`);
  }

  function handleReset() {
    setStatus("");
    setEventType("");
    setExecutionMode("");
    router.push("?");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">ステータス</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">eventType</label>
        <input
          type="text"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="invoice.created"
          className="border rounded px-2 py-1 text-sm w-40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">executionMode</label>
        <input
          type="text"
          value={executionMode}
          onChange={(e) => setExecutionMode(e.target.value)}
          placeholder="queue"
          className="border rounded px-2 py-1 text-sm w-28"
        />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
      >
        検索
      </button>
      <button
        type="button"
        onClick={handleReset}
        className="border px-3 py-1.5 rounded text-sm hover:bg-gray-50"
      >
        クリア
      </button>
    </form>
  );
}
