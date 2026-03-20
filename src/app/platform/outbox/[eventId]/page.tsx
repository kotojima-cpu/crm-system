/**
 * /platform/outbox/[eventId] — outbox イベント詳細画面（platform_admin 専用）
 *
 * 基本情報 + payload（マスク済み）+ retry/replay ボタンを表示する。
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOutboxEventDetail } from "@/features/platform-outbox";
import { OutboxDetailCard } from "@/components/platform-outbox/outbox-detail-card";
import { OutboxActionButtons } from "@/components/platform-outbox/outbox-action-buttons";

export default async function PlatformOutboxDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "platform_admin") {
    redirect("/login");
  }

  const { eventId: eventIdStr } = await params;
  const eventId = parseInt(eventIdStr, 10);
  if (!eventId || eventId <= 0) notFound();

  let event;
  try {
    event = await getOutboxEventDetail(eventId);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/platform/outbox" className="text-sm text-gray-500 hover:underline">
          ← 一覧に戻る
        </Link>
        <h1 className="text-xl font-semibold">Outbox イベント #{event.id}</h1>
      </div>

      {/* 操作ボタン */}
      <OutboxActionButtons eventId={event.id} status={event.status} />

      {/* 詳細カード */}
      <OutboxDetailCard event={event} />
    </div>
  );
}
