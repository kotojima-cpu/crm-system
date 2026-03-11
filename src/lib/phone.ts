/**
 * 電話番号を正規化する（ハイフン・空白を除去し数字のみにする）
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/[-\s\u3000]/g, "");
  return normalized || null;
}
