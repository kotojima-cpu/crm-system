import { prisma } from "@/shared/db";
import { logger } from "@/shared/logging";
import type { AlertChannel } from "./types";
import type { OutboxOperationalAlert } from "@/features/platform-outbox/types";

const DEFAULT_COOLDOWN_MINUTES = 60;

/**
 * アラート dedup キーを生成する。
 * コードを安定ソートして結合することで、順序に依存しないキーを生成する。
 */
export function buildAlertDedupKey(alerts: OutboxOperationalAlert[]): string {
  const codes = alerts.map((a) => a.code).sort();
  return codes.join("|");
}

/**
 * 指定のチャネルにアラートを送信すべきか確認する。
 * cooldown 内に同じキーで送信済みの場合は false を返す。
 */
export async function shouldSendPlatformAlert(
  alertKey: string,
  channel: AlertChannel,
  cooldownMinutes = DEFAULT_COOLDOWN_MINUTES,
): Promise<boolean> {
  try {
    const record = await prisma.platformAlertHistory.findUnique({
      where: { alertKey_channel: { alertKey, channel } },
    });
    if (!record) return true;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - record.lastSentAt.getTime();
    return elapsed >= cooldownMs;
  } catch (err) {
    logger.warn("[shouldSendPlatformAlert] DB lookup failed, allow send", { err });
    return true; // DB エラーは許可側にフォールバック
  }
}

/**
 * アラート送信済みを記録する（upsert）。
 */
export async function markPlatformAlertSent(
  alertKey: string,
  channel: AlertChannel,
): Promise<void> {
  try {
    await prisma.platformAlertHistory.upsert({
      where: { alertKey_channel: { alertKey, channel } },
      create: { alertKey, channel, lastSentAt: new Date() },
      update: { lastSentAt: new Date() },
    });
  } catch (err) {
    logger.warn("[markPlatformAlertSent] failed to record alert history", { err });
    // best-effort: 記録失敗しても送信結果には影響しない
  }
}
