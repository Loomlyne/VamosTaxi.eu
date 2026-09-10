import { describe, expect, it } from "vitest";
import { couponOnReceipt, formatPaidAt, rappenToMajor } from "./confirmation-receipt";

describe("confirmation receipt", () => {
  it("formats captured_at in Europe/Zurich", () => {
    const label = formatPaidAt("2026-09-10T19:53:06.074Z", "en");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/21:53/);
  });

  it("omits a coupon with no discount", () => {
    expect(couponOnReceipt({ couponCode: "SAVE10", discountRappen: 0, fareLines: [] })).toBeNull();
  });

  it("keeps the code and discount when the snapshot stored them", () => {
    expect(
      couponOnReceipt({
        couponCode: "SAVE10",
        discountRappen: 1000,
        fareLines: [],
      }),
    ).toEqual({ code: "SAVE10", rappen: 1000 });
  });

  it("converts rappen without inventing a figure", () => {
    expect(rappenToMajor(10810)).toBe(108.1);
    expect(rappenToMajor(null)).toBeNull();
  });
});
