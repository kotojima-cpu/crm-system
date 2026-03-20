/**
 * Local Webhook
 *
 * 実送信を行わない。dry-run として構造化ログ出力する。
 *
 * 対象環境: local / test
 */

import { logger } from "@/shared/logging";
import type { WebhookDispatcher } from "./interface";
import type { WebhookDispatchInput, WebhookDispatchResult } from "./types";

export class LocalWebhook implements WebhookDispatcher {
  /** テスト用: dispatch された入力を保持 */
  public readonly dispatched: WebhookDispatchInput[] = [];

  async dispatch(input: WebhookDispatchInput): Promise<WebhookDispatchResult> {
    this.dispatched.push(input);

    logger.info("[LocalWebhook] Webhook dispatch (dry-run)", {
      webhookEndpoint: input.endpoint,
      webhookEventType: input.eventType,
      webhookRequestId: input.requestId,
      webhookTenantId: input.tenantId,
      webhookActorUserId: input.actorUserId,
      webhookExecutionContext: input.executionContext,
    });

    return {
      ok: true,
      providerMessageId: `local-webhook-dry-run-${Date.now()}`,
      dryRun: true,
    };
  }
}
