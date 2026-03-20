/**
 * QueuePublisher Interface
 *
 * SQS を直接呼ばず、この interface を通して queue に publish する。
 */

import type { QueuePublishInput, QueuePublishResult } from "./types";

export interface QueuePublisher {
  publish(input: QueuePublishInput): Promise<QueuePublishResult>;
}
