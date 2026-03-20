import { createWebhookDispatcher, createMailer } from "@/infrastructure/factory";
import { logger } from "@/shared/logging";
import { getRequestContext } from "@/shared/context";
import {
  buildAlertDedupKey,
  shouldSendPlatformAlert,
  markPlatformAlertSent,
} from "@/features/platform-alert-history";
import {
  buildOutboxAlertWebhookPayload,
  buildOutboxAlertMailSubject,
  buildOutboxAlertMailBody,
} from "./templates";
import { auditOutboxAlertSuppressed } from "./audit";
import type { OutboxAlertNotificationInput, OutboxAlertNotificationResult } from "./types";

/**
 * Outbox 運用アラートを webhook / mail で通知する。
 *
 * 通知は best-effort — 失敗しても throw しない。
 * 外部送信は infrastructure 側の staging safety guard に委譲する。
 * cooldown: 同じアラートキーで 60 分以内に送信済みの場合は suppress する。
 */
export async function notifyOutboxOperationalAlerts(
  input: OutboxAlertNotificationInput,
): Promise<OutboxAlertNotificationResult> {
  const { summary, alerts, triggeredAt, environment } = input;

  // アラートなし → skip
  if (alerts.length === 0) {
    return { notifiedByWebhook: false, notifiedByMail: false, skipped: true, reasons: ["no alerts"], suppressedByCooldown: false, suppressedChannels: [] };
  }

  const webhookUrl = process.env.OUTBOX_ALERT_WEBHOOK_URL;
  const mailTo = process.env.OUTBOX_ALERT_EMAIL_TO;

  // 環境変数なし → skip
  if (!webhookUrl && !mailTo) {
    return {
      notifiedByWebhook: false,
      notifiedByMail: false,
      skipped: true,
      reasons: ["OUTBOX_ALERT_WEBHOOK_URL and OUTBOX_ALERT_EMAIL_TO are not set"],
      suppressedByCooldown: false,
      suppressedChannels: [],
    };
  }

  const ctx = getRequestContext();
  const requestId = ctx?.requestId ?? `alert-${triggeredAt.getTime()}`;
  const executionContext = ctx?.executionContext ?? "platform";
  const tenantId = null; // platform レベルの通知

  const alertKey = buildAlertDedupKey(alerts);
  const reasons: string[] = [];
  const suppressedChannels: string[] = [];
  let notifiedByWebhook = false;
  let notifiedByMail = false;

  // Webhook 通知
  if (webhookUrl) {
    const canSend = await shouldSendPlatformAlert(alertKey, "webhook");
    if (!canSend) {
      suppressedChannels.push("webhook");
      reasons.push("webhook suppressed by cooldown");
      logger.info("[notifyOutboxOperationalAlerts] webhook suppressed by cooldown", { alertKey });
    } else {
      try {
        const dispatcher = createWebhookDispatcher();
        const result = await dispatcher.dispatch({
          endpoint: webhookUrl,
          eventType: "outbox.operational_alert",
          body: buildOutboxAlertWebhookPayload(summary, alerts),
          requestId,
          tenantId,
          actorUserId: null,
          executionContext,
        });

        if (result.ok) {
          notifiedByWebhook = true;
          await markPlatformAlertSent(alertKey, "webhook");
        } else {
          reasons.push(`webhook failed: ${result.errorMessage}`);
          logger.warn("[notifyOutboxOperationalAlerts] webhook notification failed", {
            alertWebhookError: result.errorMessage,
            alertRequestId: requestId,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reasons.push(`webhook error: ${msg}`);
      }
    }
  }

  // Mail 通知
  if (mailTo) {
    const canSend = await shouldSendPlatformAlert(alertKey, "mail");
    if (!canSend) {
      suppressedChannels.push("mail");
      reasons.push("mail suppressed by cooldown");
      logger.info("[notifyOutboxOperationalAlerts] mail suppressed by cooldown", { alertKey });
    } else {
      try {
        const mailer = createMailer();
        const result = await mailer.send({
          to: mailTo,
          subject: buildOutboxAlertMailSubject(environment, alerts),
          text: buildOutboxAlertMailBody(summary, alerts),
          requestId,
          tenantId,
          actorUserId: null,
          executionContext,
        });

        if (result.ok) {
          notifiedByMail = true;
          await markPlatformAlertSent(alertKey, "mail");
        } else {
          reasons.push(`mail failed: ${result.errorMessage}`);
          logger.warn("[notifyOutboxOperationalAlerts] mail notification failed", {
            alertMailError: result.errorMessage,
            alertRequestId: requestId,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reasons.push(`mail error: ${msg}`);
      }
    }
  }

  const suppressedByCooldown = suppressedChannels.length > 0;

  // suppression 発生時は audit log に記録（best-effort）
  if (suppressedByCooldown) {
    await auditOutboxAlertSuppressed({
      alertKey,
      channels: suppressedChannels,
      alertCodes: alerts.map((a) => a.code),
      environment,
    }).catch(() => {});
  }

  return { notifiedByWebhook, notifiedByMail, skipped: false, reasons, suppressedByCooldown, suppressedChannels };
}
