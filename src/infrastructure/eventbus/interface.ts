/**
 * EventBusPublisher Interface
 *
 * EventBridge を直接呼ばず、この interface を通して publish する。
 */

import type { EventBusPublishInput, EventBusPublishResult } from "./types";

export interface EventBusPublisher {
  publish(input: EventBusPublishInput): Promise<EventBusPublishResult>;
}
