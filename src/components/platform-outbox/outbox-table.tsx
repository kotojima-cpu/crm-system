"use client";

import Link from "next/link";
import type { OutboxEventListItem } from "@/features/platform-outbox/types";
import { formatOutboxStatusLabel } from "@/features/platform-outbox/presenters";

interface Props {
  items: OutboxEventListItem[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-700 font-semibold",
  dead: "bg-gray-800 text-white font-semibold",
  sent: "bg-green-100 text-green-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${cls}`}>
      {formatOutboxStatusLabel(status)}
    </span>
  );
}

function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function OutboxTable({ items, total, limit, offset }: Props) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNext = nextOffset < total;
  const hasPrev = offset > 0;

  function buildPageUrl(newOffset: number) {
    if (typeof window === "undefined") return "#";
    const params = new URLSearchParams(window.location.search);
    params.set("offset", String(newOffset));
    params.set("limit", String(limit));
    return `?${params.toString()}`;
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500">
        全 {total.toLocaleString()} 件 / {offset + 1}〜{Math.min(offset + items.length, total)} 件表示
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <th className="px-3 py-2 border-b">ID</th>
              <th className="px-3 py-2 border-b">ステータス</th>
              <th className="px-3 py-2 border-b">eventType</th>
              <th className="px-3 py-2 border-b">mode</th>
              <th className="px-3 py-2 border-b">tenantId</th>
              <th className="px-3 py-2 border-b">requestId</th>
              <th className="px-3 py-2 border-b">retry</th>
              <th className="px-3 py-2 border-b">availableAt</th>
              <th className="px-3 py-2 border-b">createdAt</th>
              <th className="px-3 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-400">
                  該当するイベントがありません
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 border-b">
                <td className="px-3 py-2 font-mono text-xs">{item.id}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{item.eventType}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{item.executionMode}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{item.tenantId ?? "-"}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[120px] truncate" title={item.requestId ?? ""}>
                  {item.requestId ? item.requestId.slice(0, 12) + "…" : "-"}
                </td>
                <td className="px-3 py-2 text-xs text-center">
                  {item.retryCount}/{item.maxRetries}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {formatDateTime(item.availableAt)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {formatDateTime(item.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/platform/outbox/${item.id}`}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      <div className="flex gap-2 justify-end text-sm">
        {hasPrev && (
          <Link href={buildPageUrl(prevOffset)} className="border rounded px-3 py-1 hover:bg-gray-50">
            ← 前へ
          </Link>
        )}
        {hasNext && (
          <Link href={buildPageUrl(nextOffset)} className="border rounded px-3 py-1 hover:bg-gray-50">
            次へ →
          </Link>
        )}
      </div>
    </div>
  );
}
