import { describe, expect, it } from "vitest";
import {
  addMinutesLocal,
  couponOnReceipt,
  extraRappenByCode,
  extrasFromFareLines,
  formatPaidAt,
  formatTripDate,
  formatTripTime,
  rappenToMajor,
  receiptPriceSplit,
} from "./confirmation-receipt";

describe("confirmation receipt", () => {
  it("formats captured_at in Europe/Zurich", () => {
    const label = formatPaidAt("2026-09-10T19:53:06.074Z", "en");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/21:53/);
  });

  it("parses a postgres timestamptz with a space", () => {
    const label = formatPaidAt("2026-09-10 19:53:06.074108+00", "en");
    expect(label).toMatch(/21:53/);
  });

  it("formats the pickup wall clock without shifting timezone", () => {
    expect(formatTripDate("2026-09-11T00:55", "en")).toMatch(/11/);
    expect(formatTripDate("2026-09-11T00:55", "en")).toMatch(/Sep/);
    expect(formatTripTime("2026-09-11T00:55")).toBe("00:55");
    expect(addMinutesLocal("2026-09-11T00:55", 16)).toBe("01:11");
  });

  it("reads extra codes and amounts from fare lines", () => {
    const lines = [
      { code: "distance_fare", vehicleClass: "business", amountRappen: 10810 },
      { code: "child_seat", vehicleClass: "", amountRappen: 2162 },
    ];
    expect(extrasFromFareLines(lines)).toEqual(["child_seat"]);
    expect(extraRappenByCode(lines).child_seat).toBe(2162);
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

  it("splits a gross 108.10 into fare 100.00 and 8.1% VAT", () => {
    expect(receiptPriceSplit({ totalRappen: 10810, extraRappen: {} })).toEqual({
      fareRappen: 10000,
      vatRappen: 810,
      extras: [],
      couponRappen: 0,
      couponPercent: null,
    });
  });

  it("does not invent extra rows when the snapshot has none", () => {
    expect(receiptPriceSplit({ totalRappen: 10810, extraRappen: { child_seat: undefined } })?.extras).toEqual(
      [],
    );
  });

  it("splits a gross 129.72 with stored child seat 20.00 into fare + extra + VAT on 120", () => {
    expect(receiptPriceSplit({ totalRappen: 12972, extraRappen: { child_seat: 2000 } })).toEqual({
      fareRappen: 10000,
      vatRappen: 972,
      extras: [{ code: "child_seat", rappen: 2000 }],
      couponRappen: 0,
      couponPercent: null,
    });
  });

  it("puts 8.1% VAT on fare+extra 120, then 20% off, matching paid 108.10", () => {
    expect(
      receiptPriceSplit({
        totalRappen: 10810,
        extraRappen: { child_seat: 2000 },
        discountRappen: 2000,
      }),
    ).toEqual({
      fareRappen: 10000,
      vatRappen: 972,
      extras: [{ code: "child_seat", rappen: 2000 }],
      couponRappen: 2162,
      couponPercent: 20,
    });
  });
});
