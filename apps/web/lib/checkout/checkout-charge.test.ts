// D-19 one charge function for display and charge; D-34 coupon before VAT;
// D-35 generic extras priced from the live catalog by exact code.
// Neutral fixture numbers only — never a real price-book amount (Law 04).

import { describe, expect, it } from "vitest";
import {
  checkoutCharge,
  type CheckoutChargeInput,
  type ExtraCatalogRow,
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
