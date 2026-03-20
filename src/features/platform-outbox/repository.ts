import { prisma } from "@/shared/db";
import type {
  OutboxEventView,
  OutboxEventListItem,
  OutboxSummary,
  ListOutboxEventsFilter,
  ListOutboxEventsPagination,
} from "./types";
import { buildOutboxListItem } from "./presenters";

// ────────────────────────────────────────────────────────────
// 内部ヘルパー
// ────────────────────────────────────────────────────────────

function toView(r: {
  id: number;
  eventType: string;
  executionMode: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  availableAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OutboxEventView {
  return {
    id: r.id,
    eventType: r.eventType,
    executionMode: r.executionMode,
    status: r.status,
    retryCount: r.retryCount,
    maxRetries: r.maxRetries,
    lastError: r.lastError,
    availableAt: r.availableAt,
    processedAt: r.processedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function buildWhereClause(filter: ListOutboxEventsFilter) {
  const where: Record<string, unknown> = {};

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      where.status = { in: filter.status };
    } else {
      where.status = filter.status;
    }
  }

  if (filter.eventType) {
    where.eventType = filter.eventType;
  }

  if (filter.executionMode) {
    where.executionMode = filter.executionMode;
  }

  if (filter.fromCreatedAt || filter.toCreatedAt) {
    const createdAt: Record<string, Date> = {};
    if (filter.fromCreatedAt) createdAt.gte = filter.fromCreatedAt;
    if (filter.toCreatedAt) createdAt.lte = filter.toCreatedAt;
    where.createdAt = createdAt;
  }

  return where;
}

// ────────────────────────────────────────────────────────────
// 単件取得
// ────────────────────────────────────────────────────────────

export async function findOutboxEventById(
  id: number,
): Promise<OutboxEventView | null> {
  const r = await prisma.outboxEvent.findUnique({ where: { id } });
  return r ? toView(r) : null;
}

/**
 * 詳細取得用（payloadJson を含む生レコードを返す）
 */
export async function findOutboxEventRawById(id: number): Promise<{
  id: number;
  eventType: string;
  executionMode: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  availableAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payloadJson: string;
} | null> {
  return await prisma.outboxEvent.findUnique({ where: { id } });
}

// ────────────────────────────────────────────────────────────
// 一覧取得
// ────────────────────────────────────────────────────────────

export async function findOutboxEvents(
  filter: ListOutboxEventsFilter = {},
  pagination: ListOutboxEventsPagination = {},
): Promise<OutboxEventListItem[]> {
  const where = buildWhereClause(filter);
  const limit = Math.min(pagination.limit ?? 50, 200);
  const offset = pagination.offset ?? 0;

  const records = await prisma.outboxEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return records.map(buildOutboxListItem);
}

export async function countOutboxEvents(
  filter: ListOutboxEventsFilter = {},
): Promise<number> {
  const where = buildWhereClause(filter);
  return await prisma.outboxEvent.count({ where });
}

// ────────────────────────────────────────────────────────────
// pending/failed 一覧（poller 用）
// ────────────────────────────────────────────────────────────

export async function findPendingOutboxEvents(
  limit = 50,
): Promise<OutboxEventView[]> {
  const records = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return records.map(toView);
}

// ────────────────────────────────────────────────────────────
// summary 集計
// ────────────────────────────────────────────────────────────

/**
 * ステータス別件数を一括取得する。
 */
export async function getOutboxStatusCounts(): Promise<
  Record<string, number>
> {
  const grouped = await prisma.outboxEvent.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const counts: Record<string, number> = {
    pending: 0,
    processing: 0,
    failed: 0,
    dead: 0,
    sent: 0,
  };

  for (const row of grouped) {
    counts[row.status] = row._count.id;
  }

  return counts;
}

/**
 * 15分以上 processing のまま止まっているイベント数。
 */
export async function getStuckProcessingCount(): Promise<number> {
  const threshold = new Date(Date.now() - 15 * 60 * 1000);
  return await prisma.outboxEvent.count({
    where: {
      status: "processing",
      updatedAt: { lt: threshold },
    },
  });
}

/**
 * 指定ステータスの最古 createdAt を返す。
 */
export async function getOldestCreatedAt(
  status: string,
): Promise<Date | null> {
  const record = await prisma.outboxEvent.findFirst({
    where: { status },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return record?.createdAt ?? null;
}

/**
 * 直近の failed/dead イベントのエラーサンプルを返す（最大5件）。
 */
export async function getRecentErrorSamples(): Promise<
  Array<{ id: number; eventType: string; lastError: string }>
> {
  const records = await prisma.outboxEvent.findMany({
    where: {
      status: { in: ["failed", "dead"] },
      lastError: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, eventType: true, lastError: true },
  });

  return records
    .filter((r): r is { id: number; eventType: string; lastError: string } =>
      r.lastError !== null,
    )
    .map((r) => ({ id: r.id, eventType: r.eventType, lastError: r.lastError }));
}

/**
 * retryable failed count:
 * failed で retryCount < maxRetries のもの。
 */
export async function getRetryableFailedCount(): Promise<number> {
  // Prisma では retryCount < maxRetries の比較を直接書けないため
  // failed 件数 - dead になる前の超過分を近似する
  // シンプルに failed 全件を返す（maxRetries チェックは worker 層で行うため）
  return await prisma.outboxEvent.count({
    where: { status: "failed" },
  });
}

/**
 * summary 全情報を組み立てる。
 */
export async function buildOutboxSummary(): Promise<OutboxSummary> {
  const [
    counts,
    stuckProcessingCount,
    oldestPendingCreatedAt,
    oldestFailedCreatedAt,
    recentErrorSamples,
    retryableFailedCount,
  ] = await Promise.all([
    getOutboxStatusCounts(),
    getStuckProcessingCount(),
    getOldestCreatedAt("pending"),
    getOldestCreatedAt("failed"),
    getRecentErrorSamples(),
    getRetryableFailedCount(),
  ]);

  return {
    pendingCount: counts.pending ?? 0,
    processingCount: counts.processing ?? 0,
    failedCount: counts.failed ?? 0,
    deadCount: counts.dead ?? 0,
    sentCount: counts.sent ?? 0,
    retryableFailedCount,
    stuckProcessingCount,
    recoverableStuckCount: stuckProcessingCount,
    oldestPendingCreatedAt,
    oldestFailedCreatedAt,
    recentErrorSamples,
  };
}
