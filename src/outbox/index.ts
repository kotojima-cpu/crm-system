// Types
export type {
  OutboxStatus,
  OutboxExecutionMode,
  OutboxEventType,
  OutboxEventPayloadEnvelope,
  WriteOutboxEventInput,
  ResolvedOutboxEventInput,
} from "./types";

// Events (constants)
export {
  OUTBOX_INVOICE_CREATED,
  OUTBOX_INVOICE_CONFIRMED,
  OUTBOX_INVOICE_CANCELLED,
  OUTBOX_CUSTOMER_CREATED,
  OUTBOX_CUSTOMER_UPDATED,
  OUTBOX_CUSTOMER_DELETED,
  OUTBOX_CONTRACT_CREATED,
  OUTBOX_CONTRACT_UPDATED,
  OUTBOX_TENANT_USER_INVITE_REQUESTED,
  OUTBOX_TENANT_SUSPENDED,
  OUTBOX_TENANT_RESUMED,
  OUTBOX_EMAIL_SEND,
  OUTBOX_EMAIL_INVOICE_NOTIFICATION,
  OUTBOX_WEBHOOK_DISPATCH,
} from "./events";
export type { OutboxEventDef } from "./events";

// Status
export {
  canTransitionOutboxStatus,
  isTerminalOutboxStatus,
  isRetryableOutboxStatus,
} from "./status";

// Serializer
export {
  sanitizeOutboxPayload,
  serializeOutboxPayload,
  buildOutboxEnvelope,
  resolveOutboxEventInput,
} from "./serializer";

// Writer
export { writeOutboxEvent, buildOutboxEventInput } from "./writer";

// Dispatcher
export {
  dispatchOutboxEvent,
  markOutboxProcessing,
  markOutboxSent,
  markOutboxFailed,
  markOutboxDead,
  loadOutboxEventById,
  resolveDispatchHandlerForMode,
} from "./dispatcher";
export type { OutboxEventRecord, DispatchHandler } from "./dispatcher";

// Poller
export {
  pollPendingOutboxEvents,
  processPolledOutboxEvent,
  runOutboxPollCycle,
} from "./poller";

// Replay
export {
  resetOutboxEventToPending,
  retryOutboxEventById,
  replayDeadOutboxEventById,
  forceReplaySentOutboxEvent,
} from "./replay";

// Errors
export {
  OutboxValidationError,
  OutboxStatusTransitionError,
  OutboxSerializationError,
  OutboxDispatchError,
} from "./errors";
