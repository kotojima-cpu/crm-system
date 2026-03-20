/**
 * WebhookDispatcher Interface
 *
 * 外部 HTTP 通知をこの interface を通して送信する。
 */

import type { WebhookDispatchInput, WebhookDispatchResult } from "./types";

export interface WebhookDispatcher {
  dispatch(input: WebhookDispatchInput): Promise<WebhookDispatchResult>;
}
