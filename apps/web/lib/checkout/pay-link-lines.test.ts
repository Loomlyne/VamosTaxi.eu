import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasPayLinkExtras,
  payLinkExtraName,
  payLinkLinesForCharge,
  payLinkLinesFromRows,
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
});
