/** Recovery input/output types */

export interface RecoverStuckEventsInput {
  thresholdMinutes?: number;
  limit?: number;
  dryRun?: boolean;
}

export interface RecoverStuckEventsResult {
  scannedCount: number;
  recoveredCount: number;
  skippedCount: number;
  dryRun: boolean;
  recoveredIds: number[];
  skippedIds: number[];
}

export interface RecoverableOutboxEventView {
  id: number;
  eventType: string;
  executionMode: string;
  status: string;
  updatedAt: Date;
  retryCount: number;
  maxRetries: number;
}
