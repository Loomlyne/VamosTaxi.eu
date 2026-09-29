import { describe, expect, it } from "vitest";
import type { ConfirmationFareLine } from "./booking-read";
import {
  addMinutesLocal,
  couponOnReceipt,
  extraRappenByCode,
  formatPaidAt,
  formatTripDate,
  formatTripTime,
  rappenToMajor,
  receiptPriceSplit,
  receiptRows,
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

  it("reads extra amounts from fare lines", () => {
    const lines = [
      { code: "distance_fare", vehicleClass: "business", amountRappen: 10810 },
      { code: "child_seat", vehicleClass: "", amountRappen: 2162 },
    ];
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

describe("receiptRows", () => {
  const lines: ConfirmationFareLine[] = [
    { code: "distance_fare", vehicleClass: "business", amountRappen: 10000, kind: "fare", i18nKey: "price.line.transfer", params: {} },
    {
      code: "roof-box",
      vehicleClass: "",
      amountRappen: 2000,
      kind: "surcharge",
      i18nKey: "price.surcharge.custom",
      params: { name: "Roof box", names: { en: "Roof box", fr: "Coffre de toit" } },
    },
    { code: "SAVE10", vehicleClass: "", amountRappen: 0, kind: "coupon", i18nKey: "price.line.coupon", params: { discount_rappen: 1200 } },
    { code: "vat", vehicleClass: "", amountRappen: 800, kind: "vat", i18nKey: "price.line.vat", params: { vatRateBps: 81 } },
  ];

  it("builds fare, named extra, voucher, VAT and total from snapshot lines", () => {
    const rows = receiptRows(lines, "fr", 9800, null);
    expect(rows.map((r) => r.kind)).toEqual(["fare", "extra", "coupon", "vat", "total"]);
    expect(rows[1]!).toMatchObject({ label: "Coffre de toit", amountRappen: 2000 });
    expect(rows[2]!).toMatchObject({ label: "SAVE10", amountRappen: -1200 });
    expect(rows[3]!.amountRappen).toBe(800);
    expect(rows[4]!.amountRappen).toBe(9800);
  });

  it("shows the list price of a line the coupon was folded into", () => {
    const folded: ConfirmationFareLine[] = [{ ...lines[0]!, amountRappen: 9000, params: { list_rappen: 10000 } }, ...lines.slice(2)];
    const rows = receiptRows(folded, "en", 9800, null);
    expect(rows[0]!.amountRappen).toBe(10000);
  });

  it("humanises an extra with no names and falls back to en for a missing language", () => {
    const bare: ConfirmationFareLine[] = [{ code: "baby-shell", vehicleClass: "", amountRappen: 500, kind: "surcharge", i18nKey: "price.surcharge.custom", params: {} }];
    expect(receiptRows(bare, "de", 500, null)[0]!).toMatchObject({ kind: "extra", label: "Baby shell" });
    expect(receiptRows(lines, "de", 9800, null)[1]!.label).toBe("Roof box");
  });

  it("keeps the message key of a legacy three-code line", () => {
    const legacy: ConfirmationFareLine[] = [
      { code: "child_seat", vehicleClass: "", amountRappen: 2162, kind: "surcharge", i18nKey: "price.surcharge.child_seat.label", params: {} },
    ];
    const row = receiptRows(legacy, "en", 2162, null)[0]!;
    expect(row).toMatchObject({ kind: "extra", labelKey: "price.surcharge.child_seat.label", amountRappen: 2162 });
  });
});
