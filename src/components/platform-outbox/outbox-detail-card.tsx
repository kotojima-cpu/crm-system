"use client";

import type { OutboxEventDetail } from "@/features/platform-outbox/types";
import { formatOutboxStatusLabel } from "@/features/platform-outbox/presenters";

interface Props {
  event: OutboxEventDetail;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-700 bg-yellow-50",
  processing: "text-blue-700 bg-blue-50",
  failed: "text-red-700 bg-red-50",
  dead: "text-white bg-gray-900",
  sent: "text-green-700 bg-green-50",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b">
      <th className="px-3 py-2 text-left text-xs text-gray-500 w-36 font-medium">{label}</th>
      <td className="px-3 py-2 text-sm">{value}</td>
    </tr>
  );
}

function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP");
}

export function OutboxDetailCard({ event }: Props) {
  const statusCls = STATUS_COLORS[event.status] ?? "text-gray-700 bg-gray-50";

  return (
    <div className="space-y-6">
      {/* ステータスバッジ */}
      <div>
        <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${statusCls}`}>
          {formatOutboxStatusLabel(event.status)}
        </span>
      </div>

      {/* 基本情報 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
          基本情報
        </div>
        <table className="w-full">
          <tbody>
            <Row label="ID" value={<span className="font-mono">{event.id}</span>} />
            <Row label="eventType" value={<span className="font-mono">{event.eventType}</span>} />
            <Row label="executionMode" value={event.executionMode} />
            <Row label="retryCount" value={`${event.retryCount} / ${event.maxRetries}`} />
            <Row label="tenantId" value={event.tenantId ?? "-"} />
            <Row label="resourceId" value={event.resourceId ?? "-"} />
            <Row label="jobType" value={event.jobType ?? "-"} />
          </tbody>
        </table>
      </div>

      {/* requestId（コピー用） */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
          追跡
        </div>
        <div className="p-3">
          <div className="text-xs text-gray-500 mb-1">requestId</div>
          <div className="font-mono text-sm bg-gray-100 rounded px-2 py-1 break-all select-all">
            {event.requestId ?? "-"}
          </div>
        </div>
      </div>

      {/* タイムライン */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
          タイムライン
        </div>
        <table className="w-full">
          <tbody>
            <Row label="createdAt" value={formatDateTime(event.createdAt)} />
            <Row label="updatedAt" value={formatDateTime(event.updatedAt)} />
            <Row label="availableAt" value={formatDateTime(event.availableAt)} />
            <Row label="processedAt" value={formatDateTime(event.processedAt)} />
          </tbody>
        </table>
      </div>

      {/* エラー情報（failed/dead のみ） */}
      {event.lastError && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 uppercase">
            最終エラー
          </div>
          <div className="p-3">
            <pre className="text-xs text-red-700 whitespace-pre-wrap break-all bg-red-50 rounded p-2">
              {event.lastError}
            </pre>
          </div>
        </div>
      )}

      {/* payload（マスク済み） */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
          payload（機密フィールドはマスク済み）
        </div>
        <div className="p-3">
          <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
            {JSON.stringify(event.maskedPayload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
