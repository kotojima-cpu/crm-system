/**
 * EventBridge Publisher
 *
 * Amazon EventBridge を使った event publish 実装。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番利用前に以下を完了すること:                                       │
 * │   1. EventBridge event bus 作成                                      │
 * │   2. 環境変数 EVENTBRIDGE_BUS_NAME 設定                              │
 * │   3. AWS SDK v3 の @aws-sdk/client-eventbridge インストール          │
 * │   4. IAM 実行ロールに events:PutEvents 権限付与                      │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { logger } from "@/shared/logging";
import type { EventBusPublisher } from "./interface";
import type { EventBusPublishInput, EventBusPublishResult } from "./types";

export class EventBridgePublisher implements EventBusPublisher {
  async publish(input: EventBusPublishInput): Promise<EventBusPublishResult> {
    try {
      // ┌─ AWS SDK 呼び出し（Phase 9 以降で有効化）─────────────────────┐
      // │                                                                │
      // │ import {                                                       │
      // │   EventBridgeClient,                                           │
      // │   PutEventsCommand,                                            │
      // │ } from "@aws-sdk/client-eventbridge";                          │
      // │                                                                │
      // │ const client = new EventBridgeClient({                         │
      // │   region: getAwsRegion(),                                      │
      // │ });                                                            │
      // │ const result = await client.send(new PutEventsCommand({        │
      // │   Entries: [{                                                  │
      // │     EventBusName: process.env.EVENTBRIDGE_BUS_NAME,            │
      // │     Source: input.source,                                      │
      // │     DetailType: input.detailType,                              │
      // │     Detail: JSON.stringify({                                   │
      // │       requestId: input.requestId,                              │
      // │       tenantId: input.tenantId,                                │
      // │       ...input.detail,                                         │
      // │     }),                                                        │
      // │   }],                                                          │
      // │ }));                                                            │
      // └────────────────────────────────────────────────────────────────┘

      logger.info("[EventBridgePublisher] PutEvents (stub)", {
        eventBusSource: input.source,
        eventBusDetailType: input.detailType,
        eventBusRequestId: input.requestId,
      });

      return { ok: true, providerMessageId: `eb-stub-${Date.now()}` };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[EventBridgePublisher] PutEvents failed", err instanceof Error ? err : undefined, {
        eventBusSource: input.source,
        eventBusRequestId: input.requestId,
      });
      return { ok: false, errorMessage, retryable: true };
    }
  }
}
