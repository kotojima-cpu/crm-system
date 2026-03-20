/**
 * Infrastructure Metrics テスト
 *
 * LocalMetricsPublisher / CloudWatchMetricsPublisher / factory の動作を検証。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/shared/context/request-context", () => ({
  getRequestContext: () => null,
}));
vi.mock("@/shared/context", () => ({
  getRequestContext: () => null,
}));
vi.mock("@/shared/logging", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { LocalMetricsPublisher } = await import("@/infrastructure/metrics/local-metrics");
const { CloudWatchMetricsPublisher } = await import("@/infrastructure/metrics/cloudwatch-metrics");

// --- LocalMetricsPublisher ---

describe("LocalMetricsPublisher", () => {
  it("publish した件数が published 配列に追加される", async () => {
    const publisher = new LocalMetricsPublisher();
    await publisher.publish({ name: "OutboxEventsPending", value: 5, unit: "Count" });
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].name).toBe("OutboxEventsPending");
    expect(publisher.published[0].value).toBe(5);
  });

  it("publishMany で複数件まとめて送信できる", async () => {
    const publisher = new LocalMetricsPublisher();
    await publisher.publishMany([
      { name: "OutboxEventsFailed", value: 2, unit: "Count" },
      { name: "OutboxEventsDead",   value: 1, unit: "Count" },
    ]);
    expect(publisher.published).toHaveLength(2);
    expect(publisher.published[0].name).toBe("OutboxEventsFailed");
    expect(publisher.published[1].name).toBe("OutboxEventsDead");
  });

  it("dimensions が指定されていれば保持される", async () => {
    const publisher = new LocalMetricsPublisher();
    await publisher.publish({
      name: "OutboxStuckProcessingCount",
      value: 3,
      unit: "Count",
      dimensions: { environment: "staging" },
    });
    expect(publisher.published[0].dimensions).toEqual({ environment: "staging" });
  });

  it("publishMany に空配列を渡しても例外にならない", async () => {
    const publisher = new LocalMetricsPublisher();
    await expect(publisher.publishMany([])).resolves.not.toThrow();
    expect(publisher.published).toHaveLength(0);
  });
});

// --- CloudWatchMetricsPublisher ---

describe("CloudWatchMetricsPublisher", () => {
  it("publish が例外を throw しない（EMF stdout 出力）", async () => {
    const publisher = new CloudWatchMetricsPublisher();
    await expect(
      publisher.publish({ name: "OutboxEventsPending", value: 10, unit: "Count" }),
    ).resolves.not.toThrow();
  });

  it("publishMany が例外を throw しない", async () => {
    const publisher = new CloudWatchMetricsPublisher();
    await expect(
      publisher.publishMany([
        { name: "OutboxEventsFailed", value: 1, unit: "Count" },
        { name: "OutboxEventsDead",   value: 0, unit: "Count" },
      ]),
    ).resolves.not.toThrow();
  });

  it("dimensions を指定しても例外にならない", async () => {
    const publisher = new CloudWatchMetricsPublisher();
    await expect(
      publisher.publish({
        name: "OutboxPollProcessedCount",
        value: 50,
        unit: "Count",
        dimensions: { executionMode: "queue" },
      }),
    ).resolves.not.toThrow();
  });
});

// --- Factory ---

async function importFactory() {
  return import("@/infrastructure/factory");
}

describe("createMetricsPublisher", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("local モード → LocalMetricsPublisher", async () => {
    process.env.INFRASTRUCTURE_MODE = "local";
    const { createMetricsPublisher } = await importFactory();
    expect(createMetricsPublisher()).toBeInstanceOf(LocalMetricsPublisher);
  });

  it("aws モード → CloudWatchMetricsPublisher", async () => {
    process.env.INFRASTRUCTURE_MODE = "aws";
    const { createMetricsPublisher } = await importFactory();
    expect(createMetricsPublisher()).toBeInstanceOf(CloudWatchMetricsPublisher);
  });
});
