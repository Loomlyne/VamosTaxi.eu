// D-19 one charge function for display and charge; D-34 coupon before VAT;
// D-35 generic extras priced from the live catalog by exact code.
// Neutral fixture numbers only — never a real price-book amount (Law 04).

import { describe, expect, it } from "vitest";
import {
  checkoutCharge,
  type CheckoutChargeInput,
  type ExtraCatalogRow,
  type FareParts,
} from "./checkout-charge";
import { payableRappen } from "./payable";

const VAT = 81; // lib/checkout/vat.ts scale: 81 = 8.1 %

const CATALOG: ExtraCatalogRow[] = [
  {
    code: "child-seat",
    amountRappen: 500,
    labels: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد طفل" },
  },
  {
    code: "anything-owner-typed",
    amountRappen: 700,
    labels: {
      en: "Anything owner typed",
      de: "Anything owner typed",
      fr: "Anything owner typed",
      ar: "Anything owner typed",
    },
  },
];

function input(over: Partial<CheckoutChargeInput> = {}): CheckoutChargeInput {
  return {
    classNetRappen: 10000,
    preCouponRappen: null,
    extraCodes: [],
    catalog: CATALOG,
    coupon: null,
    vatRateBps: VAT,
    vehicleClassSlug: "economy",
    ...over,
  };
}

function sumLines(result: ReturnType<typeof checkoutCharge>): number {
  if (!result.ok) throw new Error("refused");
  return result.lines.reduce((sum, line) => sum + line.amount_rappen, 0);
}

describe("checkoutCharge", () => {
  it("no extras, no coupon equals payableRappen", () => {
    const result = checkoutCharge(input());
    const expected = payableRappen({ classNetRappen: 10000, extraAddRappen: 0, vatRateBps: VAT });
    expect(result).toMatchObject({ ok: true, ...expected });
    if (!result.ok) return;
    expect(result.lines.map((line) => line.kind)).toEqual(["fare", "vat"]);
    expect(result.lines[0]).toMatchObject({
      kind: "fare",
      i18n_key: "price.line.transfer",
      params: { vehicleClass: "economy" },
      amount_rappen: 10000,
    });
    expect(sumLines(result)).toBe(result.chargedRappen);
  });

  it("two extras add two generic surcharge lines priced from the catalog", () => {
    const result = checkoutCharge(input({ extraCodes: ["child-seat", "anything-owner-typed"] }));
    const expected = payableRappen({ classNetRappen: 10000, extraAddRappen: 1200, vatRateBps: VAT });
    expect(result).toMatchObject({ ok: true, ...expected });
    if (!result.ok) return;
    const extras = result.lines.filter((line) => line.kind === "surcharge");
    expect(extras).toEqual([
      {
        kind: "surcharge",
        code: "child-seat",
        i18n_key: "price.surcharge.custom",
        params: { name: "Child seat", names: CATALOG[0]!.labels },
        amount_rappen: 500,
      },
      {
        kind: "surcharge",
        code: "anything-owner-typed",
        i18n_key: "price.surcharge.custom",
        params: { name: "Anything owner typed", names: CATALOG[1]!.labels },
        amount_rappen: 700,
      },
    ]);
    expect(sumLines(result)).toBe(result.chargedRappen);
  });

  it("refuses a code that is not on the live catalog", () => {
    expect(checkoutCharge(input({ extraCodes: ["child-seat", "child_seat"] }))).toEqual({
      ok: false,
      code: "unknown_extra",
      extra: "child_seat",
    });
  });

  it("collapses duplicate codes to one line", () => {
    const result = checkoutCharge(input({ extraCodes: ["child-seat", "child-seat"] }));
    if (!result.ok) throw new Error("refused");
    expect(result.lines.filter((line) => line.kind === "surcharge")).toHaveLength(1);
    expect(result.netRappen).toBe(10500);
  });

  it("a percent coupon discounts the extras too (D-08a)", () => {
    const result = checkoutCharge(
      input({
        classNetRappen: 9000,
        preCouponRappen: 10000,
        extraCodes: ["child-seat", "anything-owner-typed"],
        coupon: { code: "TEN", kind: "percent", percentHundredths: 1000, amountRappen: null },
      }),
    );
    const expected = payableRappen({
      classNetRappen: 9000,
      preCouponRappen: 10000,
      extraAddRappen: 1200,
      couponPercent: 1000,
      vatRateBps: VAT,
    });
    expect(result).toMatchObject({ ok: true, ...expected });
    if (!result.ok) return;
    expect(result.lines[0]).toMatchObject({ kind: "fare", amount_rappen: 10000 });
    expect(result.lines.find((line) => line.kind === "coupon")).toMatchObject({
      code: "TEN",
      i18n_key: "price.line.coupon",
      amount_rappen: -1120,
    });
    expect(sumLines(result)).toBe(result.chargedRappen);
  });

  it("a fixed coupon comes off before VAT: 100.00 net, 10 off → 97.29 (D-34)", () => {
    const result = checkoutCharge(
      input({ coupon: { code: "FLAT", kind: "amount", percentHundredths: null, amountRappen: 1000 } }),
    );
    expect(result).toMatchObject({ ok: true, netRappen: 9000, vatRappen: 729, chargedRappen: 9729 });
    expect(sumLines(result)).toBe(9729);
  });

  it("never goes below zero", () => {
    const result = checkoutCharge(
      input({
        extraCodes: ["child-seat"],
        coupon: { code: "BIG", kind: "amount", percentHundredths: null, amountRappen: 999999 },
      }),
    );
    expect(result).toMatchObject({ ok: true, netRappen: 0, vatRappen: 0, chargedRappen: 0 });
    if (!result.ok) return;
    expect(result.lines.find((line) => line.kind === "coupon")?.amount_rappen).toBe(-10500);
    expect(result.lines.every((line) => line.kind === "coupon" || line.amount_rappen >= 0)).toBe(true);
    expect(sumLines(result)).toBe(0);
  });
});

// 261003 fare lines: the one Fare line is cut into up to three pieces that add up to it. The
// money (net, VAT, charged, every extra, the coupon) must be byte-identical with and without
// the parts. Internal rappen fixtures, never shown as a price.
const PARTS_FEE_ROUTE: FareParts = {
  airportFeeRappen: 1500,
  route: { amountRappen: 2500, origin: "Zürich", destination: "Genève" },
};

function money(result: ReturnType<typeof checkoutCharge>) {
  if (!result.ok) throw new Error("refused");
  return {
    netRappen: result.netRappen,
    vatRappen: result.vatRappen,
    chargedRappen: result.chargedRappen,
    nonFare: result.lines.filter((line) => line.kind !== "fare"),
    fareSum: result.lines
      .filter((line) => line.kind === "fare")
      .reduce((sum, line) => sum + line.amount_rappen, 0),
  };
}

describe("checkoutCharge fareParts (fare lines split)", () => {
  it("A: airport fee + route cut the Fare line into three that add up to it", () => {
    const base = checkoutCharge(input());
    const split = checkoutCharge(input({ fareParts: PARTS_FEE_ROUTE }));
    if (!split.ok) throw new Error("refused");
    expect(split.lines.filter((l) => l.kind === "fare")).toEqual([
      {
        kind: "fare",
        code: "distance_fare",
        i18n_key: "price.line.transfer",
        params: { vehicleClass: "economy" },
        amount_rappen: 6000,
      },
      { kind: "fare", code: "airport_fee", i18n_key: "price.line.airport_fee", params: {}, amount_rappen: 1500 },
      {
        kind: "fare",
        code: "fixed_route",
        i18n_key: "price.line.fixed_route",
        params: { origin: "Zürich", destination: "Genève" },
        amount_rappen: 2500,
      },
    ]);
    expect(split.lines.map((l) => l.kind)).toEqual(["fare", "fare", "fare", "vat"]);
    expect(money(split)).toEqual(money(base));
    expect(sumLines(split)).toBe(split.chargedRappen);
  });

  it("B: no fee, no route is the line it is today (identical to the call without parts)", () => {
    const without = checkoutCharge(input());
    expect(checkoutCharge(input({ fareParts: { airportFeeRappen: null, route: null } }))).toEqual(without);
    expect(checkoutCharge(input({ fareParts: { airportFeeRappen: 0, route: null } }))).toEqual(without);
  });

  it("only a fee: two fare lines, no route line, never a zero line", () => {
    const split = checkoutCharge(input({ fareParts: { airportFeeRappen: 1500, route: null } }));
    if (!split.ok) throw new Error("refused");
    expect(split.lines.filter((l) => l.kind === "fare").map((l) => [l.code, l.amount_rappen])).toEqual([
      ["distance_fare", 8500],
      ["airport_fee", 1500],
    ]);
  });

  it("route names are only kept when both are known", () => {
    const split = checkoutCharge(
      input({ fareParts: { airportFeeRappen: null, route: { amountRappen: 2500, origin: "Zürich", destination: null } } }),
    );
    if (!split.ok) throw new Error("refused");
    expect(split.lines.find((l) => l.code === "fixed_route")?.params).toEqual({});
  });

  it("C: fee + extra + percent coupon: money identical, fare pieces add up to the pre-coupon base", () => {
    const common = {
      classNetRappen: 9000,
      preCouponRappen: 10000,
      extraCodes: ["child-seat"],
      coupon: { code: "TEN", kind: "percent" as const, percentHundredths: 1000, amountRappen: null },
    };
    const base = checkoutCharge(input(common));
    const split = checkoutCharge(input({ ...common, fareParts: PARTS_FEE_ROUTE }));
    expect(money(split)).toEqual(money(base));
    if (!split.ok) throw new Error("refused");
    expect(split.lines.filter((l) => l.kind === "fare").reduce((s, l) => s + l.amount_rappen, 0)).toBe(10000);
    expect(sumLines(split)).toBe(split.chargedRappen);
  });

  it("a fixed coupon larger than the distance part still leaves net and charge untouched", () => {
    const common = {
      extraCodes: ["child-seat"],
      coupon: { code: "FLAT", kind: "amount" as const, percentHundredths: null, amountRappen: 7000 },
    };
    const base = checkoutCharge(input(common));
    const split = checkoutCharge(input({ ...common, fareParts: PARTS_FEE_ROUTE }));
    expect(money(split)).toEqual(money(base));
  });

  it("old lock without price rows: one Fare line, as today", () => {
    expect(checkoutCharge(input({ fareParts: undefined }))).toEqual(checkoutCharge(input()));
  });

  it("parts that reach the base, or a bad part, fall back to one Fare line (no throw)", () => {
    const base = checkoutCharge(input());
    for (const parts of [
      { airportFeeRappen: 4000, route: { amountRappen: 6000, origin: null, destination: null } },
      { airportFeeRappen: 10000, route: null },
      { airportFeeRappen: 12000, route: null },
      { airportFeeRappen: -5, route: null },
      { airportFeeRappen: 1.5, route: null },
      { airportFeeRappen: Number.NaN, route: null },
      { airportFeeRappen: null, route: { amountRappen: -1, origin: "a", destination: "b" } },
    ] satisfies FareParts[]) {
      expect(checkoutCharge(input({ fareParts: parts }))).toEqual(base);
    }
  });

  it("with a coupon the base is the pre-coupon fare, so parts compare against it", () => {
    const split = checkoutCharge(
      input({
        classNetRappen: 3000,
        preCouponRappen: 10000,
        coupon: { code: "BIG", kind: "amount", percentHundredths: null, amountRappen: 7000 },
        fareParts: PARTS_FEE_ROUTE,
      }),
    );
    expect(split.ok && split.lines.filter((l) => l.kind === "fare")).toHaveLength(3);
  });
});
