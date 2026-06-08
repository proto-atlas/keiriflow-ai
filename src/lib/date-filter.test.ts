import { describe, expect, it } from "vitest";
import { isDateOnlyString } from "./date-filter";

describe("isDateOnlyString", () => {
  it("YYYY-MM-DDの実在日付ならtrueを返す", () => {
    expect(isDateOnlyString("2026-05-06")).toBe(true);
  });

  it("存在しない日付ならfalseを返す", () => {
    expect(isDateOnlyString("2026-02-30")).toBe(false);
  });

  it("形式が違う値ならfalseを返す", () => {
    expect(isDateOnlyString("2026/05/06")).toBe(false);
  });
});
