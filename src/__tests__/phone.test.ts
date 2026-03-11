import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("ハイフンを除去する", () => {
    expect(normalizePhone("03-1234-5678")).toBe("0312345678");
  });

  it("半角スペースを除去する", () => {
    expect(normalizePhone("03 1234 5678")).toBe("0312345678");
  });

  it("全角スペースを除去する", () => {
    expect(normalizePhone("03\u30001234\u30005678")).toBe("0312345678");
  });

  it("ハイフンとスペースの混在を除去する", () => {
    expect(normalizePhone("03-1234 5678")).toBe("0312345678");
  });

  it("null を返す（入力が null）", () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it("null を返す（入力が undefined）", () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("null を返す（入力が空文字）", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("数字のみの入力はそのまま返す", () => {
    expect(normalizePhone("0312345678")).toBe("0312345678");
  });
});
