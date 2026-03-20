/**
 * HTTP Webhook Dispatcher
 *
 * HTTP POST で外部 endpoint に通知する実装。
 *
 * staging 安全ガード（2層）:
 * 1. isRealWebhookSendAllowed() — 環境 + disable flag チェック
 * 2. isAllowedWebhookEndpoint(url) — allowlist ホストチェック
 * 両方通過した endpoint のみ実送信する。
 */

import { logger } from "@/shared/logging";
import {
  isRealWebhookSendAllowed,
  isAllowedWebhookEndpoint,
} from "../config";
import type { WebhookDispatcher } from "./interface";
import type { WebhookDispatchInput, WebhookDispatchResult } from "./types";

/** webhook タイムアウト（ミリ秒） */
const WEBHOOK_TIMEOUT_MS = 10_000;

export class HttpWebhook implements WebhookDispatcher {
  async dispatch(input: WebhookDispatchInput): Promise<WebhookDispatchResult> {
    // --- ガード 0: URL 形式チェック（環境に依らず常に適用） ---
    if (!this.isValidHttpUrl(input.endpoint)) {
      logger.error("[HttpWebhook] Invalid endpoint URL format", undefined, {
        webhookEndpoint: input.endpoint,
        webhookEventType: input.eventType,
        webhookRequestId: input.requestId,
      });
      return {
        ok: false,
        errorMessage: `Invalid webhook endpoint URL: ${input.endpoint}`,
        retryable: false,
      };
    }

    // --- ガード 1: 環境レベルの送信可否 ---
    if (!isRealWebhookSendAllowed()) {
      logger.info("[HttpWebhook] Real webhook send is disabled — dry-run", {
        webhookEndpoint: input.endpoint,
        webhookEventType: input.eventType,
        webhookRequestId: input.requestId,
        webhookTenantId: input.tenantId,
        webhookReason: "environment_disabled",
      });
      return {
        ok: true,
        providerMessageId: null,
        dryRun: true,
        blocked: true,
      };
    }

    // --- ガード 2: allowlist チェック（staging 保護） ---
    if (!isAllowedWebhookEndpoint(input.endpoint)) {
      logger.warn("[HttpWebhook] Endpoint blocked by allowlist — dry-run", {
        webhookEndpoint: input.endpoint,
        webhookEventType: input.eventType,
        webhookRequestId: input.requestId,
        webhookTenantId: input.tenantId,
        webhookReason: "allowlist_blocked",
      });
      return {
        ok: true,
        providerMessageId: null,
        dryRun: true,
        blocked: true,
      };
    }

    // --- 実送信 ---
    return this.dispatchHttp(input);
  }

  private isValidHttpUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * HTTP POST で実送信する。
   */
  private async dispatchHttp(
    input: WebhookDispatchInput,
  ): Promise<WebhookDispatchResult> {
    // requestId / tenantId をヘッダーに注入
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Request-Id": input.requestId,
      "X-Event-Type": input.eventType,
      ...(input.tenantId !== null
        ? { "X-Tenant-Id": String(input.tenantId) }
        : {}),
      ...(input.actorUserId !== null
        ? { "X-Actor-User-Id": String(input.actorUserId) }
        : {}),
      ...input.headers,
    };

    // body に requestId / eventType を含める
    const body = JSON.stringify({
      event: input.eventType,
      requestId: input.requestId,
      executionContext: input.executionContext,
      ...input.body,
    });

    logger.info("[HttpWebhook] Dispatching webhook", {
      webhookEndpoint: input.endpoint,
      webhookEventType: input.eventType,
      webhookRequestId: input.requestId,
      webhookTenantId: input.tenantId,
      webhookExecutionContext: input.executionContext,
    });

    try {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (!response.ok) {
        // 5xx → retryable, 4xx → non-retryable
        const retryable = response.status >= 500;

        logger.warn("[HttpWebhook] Webhook returned non-OK status", {
          webhookEndpoint: input.endpoint,
          webhookStatus: response.status,
          webhookRequestId: input.requestId,
          webhookRetryable: retryable,
        });

        return {
          ok: false,
          errorMessage: `HTTP ${response.status} ${response.statusText}`,
          retryable,
        };
      }

      logger.info("[HttpWebhook] Webhook dispatched successfully", {
        webhookEndpoint: input.endpoint,
        webhookStatus: response.status,
        webhookRequestId: input.requestId,
      });

      return {
        ok: true,
        providerMessageId: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // ネットワークエラー / タイムアウト → retryable
      const retryable = true;

      logger.error("[HttpWebhook] Webhook dispatch failed", err instanceof Error ? err : undefined, {
        webhookEndpoint: input.endpoint,
        webhookRequestId: input.requestId,
        webhookRetryable: retryable,
      });

      return { ok: false, errorMessage, retryable };
    }
  }
}
