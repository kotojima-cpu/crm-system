import { runOutboxPollCycle } from "@/outbox/poller";
import {
  retryOutboxEventById,
  replayDeadOutboxEventById,
  forceReplaySentOutboxEvent,
} from "@/outbox/replay";
import { NotFoundError } from "@/shared/errors";
import {
  findOutboxEventById,
  findOutboxEventRawById,
  findOutboxEvents,
  countOutboxEvents,
  buildOutboxSummary,
} from "./repository";
import { buildOutboxListItem, buildOutboxDetailView } from "./presenters";
import { publishOutboxMetrics } from "./monitoring";
import {
  auditOutboxRetried,
  auditOutboxReplayed,
  auditOutboxForceReplayed,
  auditOutboxPollTriggered,
} from "./audit";
import { notifyOutboxOperationalAlerts } from "@/features/platform-alerts";
import {
  determineHealthCheckStatus,
  saveHealthCheckHistory,
} from "@/features/platform-health-history";
import type {
  PollCycleInput,
  PollCycleResult,
  OutboxEventView,
  OutboxEventListItem,
  OutboxEventDetail,
  OutboxSummary,
  OutboxOperationalAlert,
  ListOutboxEventsFilter,
  ListOutboxEventsPagination,
  OutboxHealthCheckResult,
} from "./types";

// ────────────────────────────────────────────────────────────
// poll サイクル
// ────────────────────────────────────────────────────────────

/**
 * outbox poll サイクルを実行する（platform/system 権限）。
 * 実行後に AuditLog を記録する。
 */
export async function runPollCycle(
  input: PollCycleInput,
): Promise<PollCycleResult> {
  const { createRegisteredHandlerMap } = await import("@/worker/handlers/index");
  const handlerMap = createRegisteredHandlerMap();

  const summary = await runOutboxPollCycle(handlerMap, {
    limit: input.limit,
    executionMode: input.executionMode,
  });

  // AuditLog（失敗しても poll 結果には影響しない）
  await auditOutboxPollTriggered({
    processedCount: summary.polledCount,
    sentCount: summary.sentCount,
    failedCount: summary.failedCount,
  }).catch(() => {});

  // CloudWatch Metrics（best-effort）
  const outboxSummary = await buildOutboxSummary().catch(() => null);
  if (outboxSummary) {
    await publishOutboxMetrics(outboxSummary).catch(() => {});
  }

  // alert 通知（best-effort）
  const alerts = await getOutboxOperationalAlerts().catch(() => []);
  if (outboxSummary && alerts.length > 0) {
    await notifyOutboxOperationalAlerts({
      summary: outboxSummary,
      alerts,
      triggeredAt: new Date(),
      environment: process.env.APP_ENV ?? "local",
    }).catch(() => {});
  }

  return { summary };
}

// ────────────────────────────────────────────────────────────
// 一覧取得
// ────────────────────────────────────────────────────────────

export async function listOutboxEvents(
  filter: ListOutboxEventsFilter = {},
  pagination: ListOutboxEventsPagination = {},
): Promise<{ items: OutboxEventListItem[]; total: number }> {
  const [items, total] = await Promise.all([
    findOutboxEvents(filter, pagination),
    countOutboxEvents(filter),
  ]);
  return { items, total };
}

// ────────────────────────────────────────────────────────────
// 単件取得
// ────────────────────────────────────────────────────────────

export async function getOutboxEventById(id: number): Promise<OutboxEventView> {
  const event = await findOutboxEventById(id);
  if (!event) {
    throw new NotFoundError(`OutboxEvent not found: id=${id}`);
  }
  return event;
}

/**
 * 詳細取得（payload マスク済み）。
 */
export async function getOutboxEventDetail(
  id: number,
): Promise<OutboxEventDetail> {
  const raw = await findOutboxEventRawById(id);
  if (!raw) {
    throw new NotFoundError(`OutboxEvent not found: id=${id}`);
  }
  return buildOutboxDetailView(raw);
}

// ────────────────────────────────────────────────────────────
// summary / アラート
// ────────────────────────────────────────────────────────────

export async function getOutboxSummary(): Promise<OutboxSummary> {
  return buildOutboxSummary();
}

/**
 * 運用担当者向けアラートを返す。
 * dead イベント / stuck processing / failed 件数超過 を検知する。
 */
export async function getOutboxOperationalAlerts(
  thresholds: { failedCountWarning?: number } = {},
): Promise<OutboxOperationalAlert[]> {
  const summary = await buildOutboxSummary();
  const alerts: OutboxOperationalAlert[] = [];

  if (summary.deadCount > 0) {
    alerts.push({ level: "warning", code: "DEAD_EVENTS_EXIST", count: summary.deadCount });
  }

  if (summary.stuckProcessingCount > 0) {
    alerts.push({ level: "warning", code: "STUCK_PROCESSING", count: summary.stuckProcessingCount });
  }

  const failedThreshold = thresholds.failedCountWarning ?? 10;
  if (summary.failedCount >= failedThreshold) {
    alerts.push({ level: "warning", code: "FAILED_EVENTS_HIGH", count: summary.failedCount });
  }

  return alerts;
}

// ────────────────────────────────────────────────────────────
// retry
// ────────────────────────────────────────────────────────────

/**
 * failed event を retry する（pending にリセット → 次回 poll で処理）。
 */
export async function retryEvent(eventId: number): Promise<OutboxEventView> {
  const raw = await findOutboxEventRawById(eventId);
  if (!raw) throw new NotFoundError(`OutboxEvent not found: id=${eventId}`);

  const record = await retryOutboxEventById(eventId);

  // AuditLog（失敗しても retry 結果には影響しない）
  await auditOutboxRetried(eventId, {
    eventType: raw.eventType,
    prevStatus: raw.status,
  }).catch(() => {});

  const view = buildOutboxListItem({
    ...raw,
    status: record.status,
    retryCount: record.retryCount,
    lastError: record.lastError,
    availableAt: record.availableAt,
    processedAt: record.processedAt,
  });
  return view;
}

// ────────────────────────────────────────────────────────────
// dead replay
// ────────────────────────────────────────────────────────────

/**
 * dead event を pending に戻して再処理対象にする。
 */
export async function replayDeadEvent(
  eventId: number,
  options: { resetRetryCount?: boolean } = {},
): Promise<OutboxEventView> {
  const raw = await findOutboxEventRawById(eventId);
  if (!raw) throw new NotFoundError(`OutboxEvent not found: id=${eventId}`);

  const record = await replayDeadOutboxEventById(eventId, options);

  await auditOutboxReplayed(eventId, {
    eventType: raw.eventType,
    resetRetryCount: options.resetRetryCount ?? false,
  }).catch(() => {});

  const view = buildOutboxListItem({
    ...raw,
    status: record.status,
    retryCount: record.retryCount,
    lastError: record.lastError,
    availableAt: record.availableAt,
    processedAt: record.processedAt,
  });
  return view;
}

// ────────────────────────────────────────────────────────────
// sent force replay（危険操作）
// ────────────────────────────────────────────────────────────

/**
 * sent event を強制 replay する（危険操作）。
 * 冪等でない handler では二重送信が発生するため、明示フラグが必要。
 * AuditLog に必ず記録する。
 */
export async function forceReplaySentEvent(
  eventId: number,
  options: { forceSentReplay: true; reason?: string },
): Promise<OutboxEventView> {
  const raw = await findOutboxEventRawById(eventId);
  if (!raw) throw new NotFoundError(`OutboxEvent not found: id=${eventId}`);

  const record = await forceReplaySentOutboxEvent(eventId, options);

  // force replay は必ず AuditLog に記録する（await して確認）
  await auditOutboxForceReplayed(eventId, {
    eventType: raw.eventType,
    reason: options.reason,
  });

  const view = buildOutboxListItem({
    ...raw,
    status: record.status,
    retryCount: record.retryCount,
    lastError: record.lastError,
    availableAt: record.availableAt,
    processedAt: record.processedAt,
  });
  return view;
}

// ────────────────────────────────────────────────────────────
// health check
// ────────────────────────────────────────────────────────────

/**
 * Outbox の健全性を確認し、metrics 発行 + アラート通知を行う。
 */
export async function runOutboxHealthCheck(): Promise<OutboxHealthCheckResult> {
  const summary = await buildOutboxSummary();
  const alerts = await getOutboxOperationalAlerts();

  let metricsPublished = false;
  try {
    await publishOutboxMetrics(summary);
    metricsPublished = true;
  } catch {
    // best-effort
  }

  let notificationResult = { notifiedByWebhook: false, notifiedByMail: false, skipped: true, reasons: ["skipped"] as string[], suppressedByCooldown: false, suppressedChannels: [] as string[] };
  try {
    notificationResult = await notifyOutboxOperationalAlerts({
      summary,
      alerts,
      triggeredAt: new Date(),
      environment: process.env.APP_ENV ?? "local",
    });
  } catch {
    // best-effort
  }

  const status = determineHealthCheckStatus(alerts);
  const notificationsSent = notificationResult.notifiedByWebhook || notificationResult.notifiedByMail;
  const suppressedByCooldown = notificationResult.suppressedByCooldown;

  // 履歴保存（best-effort）
  await saveHealthCheckHistory({
    summary,
    alerts,
    metricsPublished,
    notificationsSent,
    suppressedByCooldown,
  }).catch(() => {});

  return {
    summary,
    alerts,
    metricsPublished,
    notificationsSent,
    notificationReasons: notificationResult.reasons,
    status,
    suppressedByCooldown,
  };
}

// ────────────────────────────────────────────────────────────
// recovery + report
// ────────────────────────────────────────────────────────────

/**
 * stuck event の recovery を実行し、結果サマリーと metrics を再発行する。
 */
export async function recoverStuckEventsAndReport(
  input: import("@/features/platform-outbox-recovery").RecoverStuckEventsInput,
): Promise<{
  recovery: import("@/features/platform-outbox-recovery").RecoverStuckEventsResult;
  healthCheck: OutboxHealthCheckResult;
}> {
  const { recoverStuckOutboxEvents } = await import("@/features/platform-outbox-recovery");
  const recovery = await recoverStuckOutboxEvents(input);

  const healthCheck = await runOutboxHealthCheck();

  return { recovery, healthCheck };
}
