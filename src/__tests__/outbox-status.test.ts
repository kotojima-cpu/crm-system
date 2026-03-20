import { describe, it, expect } from "vitest";
import {
  canTransitionOutboxStatus,
  isTerminalOutboxStatus,
  isRetryableOutboxStatus,
} from "@/outbox/status";

describe("canTransitionOutboxStatus", () => {
  // --- 許可される遷移 ---
  it("pending → processing は許可", () => {
    expect(canTransitionOutboxStatus("pending", "processing")).toBe(true);
  });

  it("processing → sent は許可", () => {
    expect(canTransitionOutboxStatus("processing", "sent")).toBe(true);
  });

  it("processing → failed は許可", () => {
    expect(canTransitionOutboxStatus("processing", "failed")).toBe(true);
  });

  it("failed → processing は許可（リトライ）", () => {
    expect(canTransitionOutboxStatus("failed", "processing")).toBe(true);
  });

  it("failed → dead は許可（リトライ上限超過）", () => {
    expect(canTransitionOutboxStatus("failed", "dead")).toBe(true);
  });

  // --- 禁止される遷移 ---
  it("sent → pending は禁止", () => {
    expect(canTransitionOutboxStatus("sent", "pending")).toBe(false);
  });

  it("sent → processing は禁止", () => {
    expect(canTransitionOutboxStatus("sent", "processing")).toBe(false);
  });

  it("dead → processing は禁止", () => {
    expect(canTransitionOutboxStatus("dead", "processing")).toBe(false);
  });

  it("dead → pending は禁止", () => {
    expect(canTransitionOutboxStatus("dead", "pending")).toBe(false);
  });

  it("pending → sent は禁止（processing を飛ばせない）", () => {
    expect(canTransitionOutboxStatus("pending", "sent")).toBe(false);
  });

  it("pending → failed は禁止", () => {
    expect(canTransitionOutboxStatus("pending", "failed")).toBe(false);
  });

  it("pending → dead は禁止", () => {
    expect(canTransitionOutboxStatus("pending", "dead")).toBe(false);
  });
});

describe("isTerminalOutboxStatus", () => {
  it("sent は終端", () => {
    expect(isTerminalOutboxStatus("sent")).toBe(true);
  });

  it("dead は終端", () => {
    expect(isTerminalOutboxStatus("dead")).toBe(true);
  });

  it("pending は非終端", () => {
    expect(isTerminalOutboxStatus("pending")).toBe(false);
  });

  it("processing は非終端", () => {
    expect(isTerminalOutboxStatus("processing")).toBe(false);
  });

  it("failed は非終端", () => {
    expect(isTerminalOutboxStatus("failed")).toBe(false);
  });
});

describe("isRetryableOutboxStatus", () => {
  it("failed はリトライ可能", () => {
    expect(isRetryableOutboxStatus("failed")).toBe(true);
  });

  it("pending はリトライ不可", () => {
    expect(isRetryableOutboxStatus("pending")).toBe(false);
  });

  it("processing はリトライ不可", () => {
    expect(isRetryableOutboxStatus("processing")).toBe(false);
  });

  it("sent はリトライ不可", () => {
    expect(isRetryableOutboxStatus("sent")).toBe(false);
  });

  it("dead はリトライ不可", () => {
    expect(isRetryableOutboxStatus("dead")).toBe(false);
  });
});
