import { describe, expect, it } from "vitest";
import { formatJapaneseDateTime, formatYen } from "./format";

describe("formatYen", () => {
  it("正の金額を渡したら円表記に整形する", () => {
    expect(formatYen(110000)).toBe("￥110,000");
  });

  it("0を渡したら0円として整形する", () => {
    expect(formatYen(0)).toBe("￥0");
  });
});

describe("formatJapaneseDateTime", () => {
  it("UTCの日時文字列を渡したら日本時間で整形する", () => {
    expect(formatJapaneseDateTime("2026-05-09T03:31:00.000Z")).toBe("2026/05/09 12:31");
  });
});
