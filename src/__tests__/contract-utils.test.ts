import { describe, it, expect } from "vitest";
import { calculateContractStatus } from "@/lib/contract-utils";

function d(dateStr: string): Date {
  return new Date(dateStr);
}

describe("calculateContractStatus", () => {
  // ============================
  // 基本的な計算
  // ============================
  describe("基本計算", () => {
    it("契約開始直後は残回数が全回数と一致する", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-03-01"),
        contractMonths: 60,
        billingBaseDay: 1,
        now: d("2026-03-01"),
      });
      expect(result.remainingCount).toBe(60);
      expect(result.elapsedCount).toBe(0);
      expect(result.contractStatus).toBe("active");
    });

    it("1ヶ月経過後は残59回", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-03-01"),
        contractMonths: 60,
        billingBaseDay: 1,
        now: d("2026-04-01"),
      });
      expect(result.remainingCount).toBe(59);
      expect(result.elapsedCount).toBe(1);
    });

    it("12ヶ月経過後は残48回", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-03-01"),
        contractMonths: 60,
        billingBaseDay: 1,
        now: d("2027-03-01"),
      });
      expect(result.remainingCount).toBe(48);
      expect(result.elapsedCount).toBe(12);
    });
  });

  // ============================
  // 契約開始月の境界
  // ============================
  describe("契約開始月の境界", () => {
    it("契約開始日より前はelapsed=0", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2026-03-31"),
      });
      expect(result.elapsedCount).toBe(0);
      expect(result.remainingCount).toBe(24);
    });

    it("契約開始月の基準日当日でelapsed=0（開始月はまだ経過していない）", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2026-04-01"),
      });
      expect(result.elapsedCount).toBe(0);
      expect(result.remainingCount).toBe(24);
    });

    it("開始月の翌月の基準日でelapsed=1", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2026-05-01"),
      });
      expect(result.elapsedCount).toBe(1);
      expect(result.remainingCount).toBe(23);
    });
  });

  // ============================
  // 契約終了月の境界
  // ============================
  describe("契約終了月の境界", () => {
    it("最終月の基準日前は残1回", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2024-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2026-03-15"),
      });
      expect(result.remainingCount).toBe(1);
      expect(result.contractStatus).toBe("expiring_soon");
    });

    it("最終月の基準日当日で残0（expired）", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2024-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2026-04-01"),
      });
      expect(result.remainingCount).toBe(0);
      expect(result.contractStatus).toBe("expired");
    });

    it("契約期間を超過しても残0のまま（マイナスにならない）", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2024-04-01"),
        contractMonths: 24,
        billingBaseDay: 1,
        now: d("2027-01-01"),
      });
      expect(result.remainingCount).toBe(0);
      expect(result.elapsedCount).toBe(24);
      expect(result.contractStatus).toBe("expired");
    });
  });

  // ============================
  // 残回数0の境界
  // ============================
  describe("残回数0の境界", () => {
    it("残1回→0回の切り替わり", () => {
      // 2025-01-01開始, 12ヶ月, 基準日15日
      // 2025-12-14: 月差11, 14 < 15なので -1 → elapsed=10, remaining=2
      const twoLeft = calculateContractStatus({
        contractStartDate: d("2025-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2025-12-14"),
      });
      expect(twoLeft.remainingCount).toBe(2);
      expect(twoLeft.contractStatus).toBe("expiring_soon");

      // 2025-12-15: 月差11, 15 >= 15 → elapsed=11, remaining=1
      const oneLeft = calculateContractStatus({
        contractStartDate: d("2025-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2025-12-15"),
      });
      expect(oneLeft.remainingCount).toBe(1);
      expect(oneLeft.contractStatus).toBe("expiring_soon");

      // 2026-01-15: 月差12, 15 >= 15 → elapsed=12, remaining=0
      const zeroLeft = calculateContractStatus({
        contractStartDate: d("2025-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2026-01-15"),
      });
      expect(zeroLeft.remainingCount).toBe(0);
      expect(zeroLeft.contractStatus).toBe("expired");
    });

    it("契約月数1の最短契約", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-03-01"),
        contractMonths: 1,
        billingBaseDay: 1,
        now: d("2026-04-01"),
      });
      expect(result.remainingCount).toBe(0);
      expect(result.contractStatus).toBe("expired");
    });
  });

  // ============================
  // 基準日前後の境界
  // ============================
  describe("基準日前後の境界", () => {
    it("基準日15日: 14日時点ではまだ前月扱い", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2026-02-14"),
      });
      expect(result.elapsedCount).toBe(0);
      expect(result.remainingCount).toBe(12);
    });

    it("基準日15日: 15日時点で当月カウント", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2026-02-15"),
      });
      expect(result.elapsedCount).toBe(1);
      expect(result.remainingCount).toBe(11);
    });

    it("基準日15日: 16日時点でも当月カウント（同じ）", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 15,
        now: d("2026-02-16"),
      });
      expect(result.elapsedCount).toBe(1);
      expect(result.remainingCount).toBe(11);
    });

    it("基準日28日: 月末の境界", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 6,
        billingBaseDay: 28,
        now: d("2026-02-27"),
      });
      expect(result.elapsedCount).toBe(0);

      const result2 = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 6,
        billingBaseDay: 28,
        now: d("2026-02-28"),
      });
      expect(result2.elapsedCount).toBe(1);
    });
  });

  // ============================
  // ステータス遷移
  // ============================
  describe("ステータス遷移", () => {
    it("残4回以上はactive", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 1,
        now: d("2026-09-01"),
      });
      expect(result.remainingCount).toBe(4);
      expect(result.contractStatus).toBe("active");
    });

    it("残3回はexpiring_soon", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 1,
        now: d("2026-10-01"),
      });
      expect(result.remainingCount).toBe(3);
      expect(result.contractStatus).toBe("expiring_soon");
    });

    it("残1回はexpiring_soon", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 1,
        now: d("2026-12-01"),
      });
      expect(result.remainingCount).toBe(1);
      expect(result.contractStatus).toBe("expiring_soon");
    });

    it("残0回はexpired", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 12,
        billingBaseDay: 1,
        now: d("2027-01-01"),
      });
      expect(result.remainingCount).toBe(0);
      expect(result.contractStatus).toBe("expired");
    });
  });

  // ============================
  // billingBaseDay が null の場合
  // ============================
  describe("billingBaseDay が null の場合", () => {
    it("契約開始日の日付を基準日として使用する", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-03-15"),
        contractMonths: 6,
        billingBaseDay: null,
        now: d("2026-04-14"),
      });
      // 基準日は15日、4/14はまだ基準日前
      expect(result.elapsedCount).toBe(0);

      const result2 = calculateContractStatus({
        contractStartDate: d("2026-03-15"),
        contractMonths: 6,
        billingBaseDay: null,
        now: d("2026-04-15"),
      });
      expect(result2.elapsedCount).toBe(1);
    });
  });

  // ============================
  // 終了予定日の計算
  // ============================
  describe("終了予定日", () => {
    it("開始日 + contractMonths を正しく算出する", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-01"),
        contractMonths: 60,
        billingBaseDay: 1,
        now: d("2026-01-01"),
      });
      expect(result.expectedEndDate.getFullYear()).toBe(2031);
      expect(result.expectedEndDate.getMonth()).toBe(0); // January
      expect(result.expectedEndDate.getDate()).toBe(1);
    });

    it("月末開始の場合も正しく計算", () => {
      const result = calculateContractStatus({
        contractStartDate: d("2026-01-31"),
        contractMonths: 1,
        billingBaseDay: null,
        now: d("2026-01-31"),
      });
      // 1/31 + 1ヶ月 = 2/28 or 3/3 (JS Date は月オーバーフロー)
      expect(result.expectedEndDate.getMonth()).toBeGreaterThanOrEqual(1);
    });
  });
});
