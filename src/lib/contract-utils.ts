/**
 * リース契約の残回数・経過回数・契約状態を動的計算する
 */

export type ContractCalcInput = {
  contractStartDate: Date;
  contractMonths: number;
  billingBaseDay: number | null; // 請求基準日（1〜28、null の場合は契約開始日の日を使用）
  now?: Date; // テスト用に注入可能
};

export type ContractCalcResult = {
  remainingCount: number;   // 残回数（0以上）
  elapsedCount: number;     // 経過回数
  contractStatus: string;   // "active" | "expiring_soon" | "expired"
  expectedEndDate: Date;    // 終了予定日
};

/**
 * 残回数を計算する
 *
 * ルール:
 * - 残回数は手動で減算しない。表示時に再計算する
 * - 残回数は 0 未満にならない
 * - 契約終了後は状態を「expired」にする
 * - 残3ヶ月以内は「expiring_soon」
 *
 * 計算ロジック:
 * - 基準日（billingBaseDay または契約開始日の日）を基準として、
 *   現在日が基準日を過ぎていれば当月分をカウントする
 * - 経過回数 = (年差 × 12 + 月差) を基準日で補正
 */
export function calculateContractStatus(input: ContractCalcInput): ContractCalcResult {
  const { contractStartDate, contractMonths, billingBaseDay } = input;
  const now = input.now ?? new Date();

  const start = new Date(contractStartDate);
  const baseDay = billingBaseDay ?? start.getDate();

  // 終了予定日: 開始日 + contractMonths ヶ月
  const expectedEndDate = new Date(start);
  expectedEndDate.setMonth(expectedEndDate.getMonth() + contractMonths);

  // 経過月数の計算
  let elapsedCount = calcElapsedMonths(start, now, baseDay);

  // 経過回数は 0 〜 contractMonths の範囲にクランプ
  elapsedCount = Math.max(0, Math.min(contractMonths, elapsedCount));

  const remainingCount = contractMonths - elapsedCount;

  // ステータス判定
  let contractStatus: string;
  if (remainingCount <= 0) {
    contractStatus = "expired";
  } else if (remainingCount <= 3) {
    contractStatus = "expiring_soon";
  } else {
    contractStatus = "active";
  }

  return {
    remainingCount,
    elapsedCount,
    contractStatus,
    expectedEndDate,
  };
}

/**
 * 基準日を考慮した経過月数を計算する
 *
 * 契約開始日から現在日までの月数を算出し、
 * 現在日が当月の基準日を過ぎているかどうかで補正する
 */
function calcElapsedMonths(start: Date, now: Date, baseDay: number): number {
  // 契約開始前
  if (now < start) return 0;

  const yearDiff = now.getFullYear() - start.getFullYear();
  const monthDiff = now.getMonth() - start.getMonth();
  let months = yearDiff * 12 + monthDiff;

  // 基準日による補正:
  // 現在日が基準日より前の場合、まだその月の請求は発生していない
  const currentDay = now.getDate();
  if (currentDay < baseDay) {
    months -= 1;
  }

  return Math.max(0, months);
}
