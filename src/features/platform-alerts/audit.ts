/**
 * platform-alerts 監査ログ helper
 *
 * アラート suppression（cooldown による送信抑制）を AuditLog に記録する。
 * best-effort — 失敗しても throw しない。
 */

import { withPlatformTx } from "@/shared/db";
import { writeAuditLog } from "@/audit/writer";
import { AUDIT_OUTBOX_ALERT_SUPPRESSED } from "@/audit/actions";

export async function auditOutboxAlertSuppressed(meta: {
  alertKey: string;
  channels: string[];
  alertCodes: string[];
  environment: string;
}): Promise<void> {
  try {
    await withPlatformTx(async (tx) => {
      await writeAuditLog(tx, {
        ...AUDIT_OUTBOX_ALERT_SUPPRESSED,
        result: "success",
        message: `Outbox alert suppressed by cooldown: channels=[${meta.channels.join(",")}]`,
        newValues: {
          reason: "cooldown",
          alertKey: meta.alertKey,
          channels: meta.channels,
          alertCodes: meta.alertCodes,
          environment: meta.environment,
        },
      });
    });
  } catch {
    // best-effort
  }
}
