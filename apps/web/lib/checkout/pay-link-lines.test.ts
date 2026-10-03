import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasPayLinkExtras,
  payLinkExtraName,
  payLinkLinesForCharge,
  payLinkLinesFromRows,
  payLinkShownRappen,
} from "./pay-link-lines";

// TEST FIXTURE amounts, not price-book numbers.
const rows = [
  { kind: "fare", code: "distance_fare", names: null, vat_rate_bps: null, amount_rappen: "5000" },
  {
    kind: "surcharge",
    code: "child-seat",
    names: { en: "Child seat", de: "Kindersitz" },
    vat_rate_bps: null,
    amount_rappen: 1000,
  },
  { kind: "surcharge", code: "pet-crate", names: null, vat_rate_bps: null, amount_rappen: 1500 },
  { kind: "vat", code: "vat", names: null, vat_rate_bps: 810, amount_rappen: 500 },
  { kind: "weird", code: "x", names: null, vat_rate_bps: null, amount_rappen: 1 },
];

describe("pay-link lines (G9)", () => {
  const lines = payLinkLinesFromRows(rows);

  it("keeps the four known kinds, parses bigint strings, drops the rest", () => {
    expect(lines.map((l) => l.kind)).toEqual(["fare", "surcharge", "surcharge", "vat"]);
    expect(lines[0]?.amountRappen).toBe(5000);
    expect(lines[3]?.vatRateBps).toBe(810);
  });

  it("trusts the lines only when they sum to the charged amount", () => {
    expect(payLinkLinesForCharge(lines, 8000)).toHaveLength(4);
    expect(payLinkLinesForCharge(lines, 8001)).toEqual([]);
  });

  it("names: names[locale], then names.en, then the humanised code, never the raw code", () => {
    const seat = lines[1]!;
    const crate = lines[2]!;
    expect(payLinkExtraName(seat, "de")).toBe("Kindersitz");
    expect(payLinkExtraName(seat, "fr")).toBe("Child seat");
    expect(payLinkExtraName(crate, "ar")).toBe("Pet crate");
  });

  it("no extras: no breakdown", () => {
    expect(hasPayLinkExtras(lines)).toBe(true);
    expect(hasPayLinkExtras([lines[0]!, lines[3]!])).toBe(false);
    expect(hasPayLinkExtras([])).toBe(false);
  });

  it("the open route reads the lines through the new function and sends them with the hosted answer", () => {
    const src = readFileSync(join(__dirname, "../../app/api/checkout/pay-link/open/route.ts"), "utf8");
    expect(src).toContain("public.checkout_pay_link_lines(decode(${tokenHex}, 'hex'))");
    expect(src).toContain("payLinkLinesForCharge(");
    expect(src).toContain("lines,");
  });

  it("261003: the open route also selects the list, discount and town columns", () => {
    const src = readFileSync(join(__dirname, "../../app/api/checkout/pay-link/open/route.ts"), "utf8");
    expect(src).toContain("list_rappen, discount_rappen, origin, destination");
  });
});

// 261003: fare pieces and a voucher. TEST FIXTURE amounts, not price-book numbers.
describe("pay-link lines with fare pieces and a voucher (261003)", () => {
  const fixture = [
    // distance 4000 fully taken by the voucher, fee 1500 partly, route untouched, extra untouched.
    { kind: "fare", code: "distance_fare", names: null, vat_rate_bps: null, amount_rappen: 0, list_rappen: 4000, discount_rappen: null, origin: null, destination: null },
    { kind: "fare", code: "airport_fee", names: null, vat_rate_bps: null, amount_rappen: 500, list_rappen: 1500, discount_rappen: null, origin: null, destination: null },
    { kind: "fare", code: "fixed_route", names: null, vat_rate_bps: null, amount_rappen: 2500, list_rappen: null, discount_rappen: null, origin: "Zürich", destination: "Genève" },
    { kind: "surcharge", code: "child-seat", names: { en: "Child seat" }, vat_rate_bps: null, amount_rappen: 1000, list_rappen: null, discount_rappen: null, origin: null, destination: null },
    { kind: "coupon", code: "WELCOME", names: null, vat_rate_bps: null, amount_rappen: null, list_rappen: null, discount_rappen: 5000, origin: null, destination: null },
    { kind: "vat", code: "vat", names: null, vat_rate_bps: 81, amount_rappen: 400, list_rappen: null, discount_rappen: null, origin: null, destination: null },
  ];
  const lines = payLinkLinesFromRows(fixture);

  it("carries list, discount and town names; the guard still sums the saved amounts", () => {
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatchObject({ listRappen: 4000, discountRappen: null });
    expect(lines[2]).toMatchObject({ origin: "Zürich", destination: "Genève" });
    expect(lines[4]).toMatchObject({ discountRappen: 5000, amountRappen: 0 });
    expect(payLinkLinesForCharge(lines, 4400)).toHaveLength(6);
    expect(payLinkLinesForCharge(lines, 4401)).toEqual([]);
  });

  it("shows list figures and the voucher as its discount: shown lines add up to the same total", () => {
    const shown = lines.map(payLinkShownRappen);
    expect(shown).toEqual([4000, 1500, 2500, 1000, -5000, 400]);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(4400);
  });

  it("the two fare pieces switch the breakdown on, with or without a ticked extra", () => {
    expect(hasPayLinkExtras([lines[0]!, lines[1]!, lines[5]!])).toBe(true);
    expect(hasPayLinkExtras([lines[0]!, lines[2]!, lines[5]!])).toBe(true);
    expect(hasPayLinkExtras([lines[0]!, lines[5]!])).toBe(false);
  });

  it("a half-known route carries no names; an old line carries none of the new fields", () => {
    const half = payLinkLinesFromRows([{ kind: "fare", code: "fixed_route", names: null, vat_rate_bps: null, amount_rappen: 1, origin: "Zürich", destination: null }]);
    expect(half[0]).toMatchObject({ origin: null, destination: null });
    const old = payLinkLinesFromRows([
      { kind: "fare", code: "distance_fare", names: null, vat_rate_bps: null, amount_rappen: 9000 },
      { kind: "coupon", code: "coupon", names: null, vat_rate_bps: null, amount_rappen: -500 },
    ]);
    expect(old.map(payLinkShownRappen)).toEqual([9000, -500]);
  });
});
