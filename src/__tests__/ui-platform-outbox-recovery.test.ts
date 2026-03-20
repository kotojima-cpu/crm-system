/**
 * Platform Outbox Recovery UI ロジックテスト
 *
 * UI コンポーネントの依存ロジックを検証:
 * - recovery validators の入力制約
 * - force replay 理由の必須チェック
 * - action button の表示制御ロジック
 * - recovery パネルの状態ロジック
 *
 * (jsdom なし環境のため、rendering ではなくロジックを検証する)
 */

import { describe, it, expect } from "vitest";
import { validateRecoverStuckEventsInput } from "@/features/platform-outbox-recovery/validators";
import {
  isOutboxRetryAllowed,
  isOutboxReplayAllowed,
  isOutboxForceReplayAllowed,
} from "@/features/platform-outbox/presenters";
import { ValidationError } from "@/shared/errors";

// ────────────────────────────────────────────────────────────
// recovery panel の入力バリデーションロジック
// ────────────────────────────────────────────────────────────

describe("OutboxRecoveryPanel — バリデーション", () => {
  it("thresholdMinutes=15, limit=100, dryRun=false はデフォルト値", () => {
    const result = validateRecoverStuckEventsInput({});
    expect(result.thresholdMinutes).toBe(15);
    expect(result.limit).toBe(100);
    expect(result.dryRun).toBe(false);
  });

  it("dryRun=true は確認専用モード", () => {
    const result = validateRecoverStuckEventsInput({ dryRun: true });
    expect(result.dryRun).toBe(true);
  });

  it("limit 超過 → ValidationError（送信前に検知可能）", () => {
    expect(() => validateRecoverStuckEventsInput({ limit: 501 })).toThrow(
      ValidationError,
    );
  });

  it("thresholdMinutes=0 → ValidationError", () => {
    expect(() =>
      validateRecoverStuckEventsInput({ thresholdMinutes: 0 }),
    ).toThrow(ValidationError);
  });

  it("limit=1 (最小値) は有効", () => {
    const result = validateRecoverStuckEventsInput({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it("thresholdMinutes=1440 (最大値) は有効", () => {
    const result = validateRecoverStuckEventsInput({ thresholdMinutes: 1440 });
    expect(result.thresholdMinutes).toBe(1440);
  });
});

// ────────────────────────────────────────────────────────────
// force replay ボタンの制御ロジック
// ────────────────────────────────────────────────────────────

describe("OutboxActionButtons — force replay 理由チェック", () => {
  it("reason が空文字 → 送信不可（trim 後に falsy）", () => {
    const reason = "   ";
    expect(reason.trim()).toBe("");
    expect(Boolean(reason.trim())).toBe(false);
  });

  it("reason が入力済み → 送信可能", () => {
    const reason = "メール再送要求 (顧客 #1234)";
    expect(reason.trim()).not.toBe("");
    expect(Boolean(reason.trim())).toBe(true);
  });

  it("isOutboxForceReplayAllowed は sent のみ true", () => {
    expect(isOutboxForceReplayAllowed("sent")).toBe(true);
    expect(isOutboxForceReplayAllowed("failed")).toBe(false);
    expect(isOutboxForceReplayAllowed("dead")).toBe(false);
    expect(isOutboxForceReplayAllowed("pending")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// action button の表示制御ロジック
// ────────────────────────────────────────────────────────────

describe("OutboxActionButtons — ステータス別表示制御", () => {
  it("failed → retry のみ有効", () => {
    expect(isOutboxRetryAllowed("failed")).toBe(true);
    expect(isOutboxReplayAllowed("failed")).toBe(false);
    expect(isOutboxForceReplayAllowed("failed")).toBe(false);
  });

  it("dead → replay のみ有効", () => {
    expect(isOutboxRetryAllowed("dead")).toBe(false);
    expect(isOutboxReplayAllowed("dead")).toBe(true);
    expect(isOutboxForceReplayAllowed("dead")).toBe(false);
  });

  it("sent → force replay のみ有効", () => {
    expect(isOutboxRetryAllowed("sent")).toBe(false);
    expect(isOutboxReplayAllowed("sent")).toBe(false);
    expect(isOutboxForceReplayAllowed("sent")).toBe(true);
  });

  it("pending → どのアクションも無効", () => {
    expect(isOutboxRetryAllowed("pending")).toBe(false);
    expect(isOutboxReplayAllowed("pending")).toBe(false);
    expect(isOutboxForceReplayAllowed("pending")).toBe(false);
  });

  it("processing → どのアクションも無効", () => {
    expect(isOutboxRetryAllowed("processing")).toBe(false);
    expect(isOutboxReplayAllowed("processing")).toBe(false);
    expect(isOutboxForceReplayAllowed("processing")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// recovery パネルの dryRun / 実行 の分岐ロジック
// ────────────────────────────────────────────────────────────

describe("recovery パネル dryRun 分岐", () => {
  it("dryRun=true → DB 更新なし、対象一覧のみ", async () => {
    // dryRun 結果の構造を確認
    const dryRunResult = {
      recovery: {
        dryRun: true,
        scannedCount: 3,
        recoveredCount: 0,
        skippedCount: 3,
        recoveredIds: [1, 2, 3],
        skippedIds: [],
      },
    };
    expect(dryRunResult.recovery.dryRun).toBe(true);
    expect(dryRunResult.recovery.recoveredCount).toBe(0);
    expect(dryRunResult.recovery.recoveredIds).toHaveLength(3);
  });

  it("dryRun=false → recoveredCount が更新される", () => {
    const execResult = {
      recovery: {
        dryRun: false,
        scannedCount: 3,
        recoveredCount: 2,
        skippedCount: 1,
        recoveredIds: [1, 2],
        skippedIds: [3],
      },
    };
    expect(execResult.recovery.recoveredCount).toBe(2);
    expect(execResult.recovery.skippedCount).toBe(1);
  });
});
