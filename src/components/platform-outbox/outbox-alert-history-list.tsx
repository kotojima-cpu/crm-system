import type { PlatformAlertHistoryRecord } from "@/features/platform-alert-history/types";
import { formatAlertHistoryLabel } from "@/features/platform-alert-history";

interface Props {
  items: PlatformAlertHistoryRecord[];
}

export function OutboxAlertHistoryList({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400">アラート履歴がありません</p>;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">最終送信日時</th>
            <th className="px-3 py-2 text-left font-medium">チャネル</th>
            <th className="px-3 py-2 text-left font-medium">Alert Key</th>
            <th className="px-3 py-2 text-left font-medium">表示</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2">{item.lastSentAt.toLocaleString("ja-JP")}</td>
              <td className="px-3 py-2">{item.channel}</td>
              <td className="px-3 py-2 font-mono text-gray-600 break-all">{item.alertKey}</td>
              <td className="px-3 py-2 text-gray-700">{formatAlertHistoryLabel(item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
