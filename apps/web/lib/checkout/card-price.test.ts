// The class card shows what checkout charges for the same class with no extras and no voucher.
// Display-only rule: the card number is the output of the checkout charge function, never a copy
// of its rounding.

import { describe, expect, it } from "vitest";
import { checkoutCharge } from "./checkout-charge";
import { classCardRappen, classCardVatRappen } from "./card-price";
import { payableRappen } from "./payable";
import { parseQuoteJson } from "./checkout-quote";

const SLUGS = ["economy", "business", "van-luxury"] as const;
// Class nets in rappen, odd ones on purpose so the rounding rule is exercised.
const NETS = [7651, 10000, 12345, 99999, 1, 5000];
const RATES = [81, 77, 0];

function charged(net: number, bps: number, slug: string): number {
  const r = checkoutCharge({
    classNetRappen: net,
    preCouponRappen: null,
    extraCodes: [],
    catalog: [],
    coupon: null,
    vatRateBps: bps,
    vehicleClassSlug: slug,
  });
  if (!r.ok) throw new Error("unexpected refusal");
  return r.chargedRappen;
}

describe("classCardRappen", () => {
  it("an Economy net of 7651 rappen shows 8271, the checkout total", () => {
    expect(classCardRappen(7651, 81)).toBe(8271);
    expect(charged(7651, 81, "economy")).toBe(8271);
    expect(classCardVatRappen(7651, 81)).toBe(620);
  });

  it("equals the checkout charge for every vehicle class, net and rate", () => {
    for (const slug of SLUGS) {
      for (const net of NETS) {
        for (const bps of RATES) {
          expect(classCardRappen(net, bps), `${slug} ${net} @${bps}`).toBe(charged(net, bps, slug));
        }
      }
    }
  });

  it("card = net + the VAT slice shown in the breakdown", () => {
    for (const net of NETS) {
      expect(classCardRappen(net, 81)! - classCardVatRappen(net, 81)!).toBe(net);
      expect(classCardVatRappen(net, 81)).toBe(payableRappen({ classNetRappen: net, extraAddRappen: 0, vatRateBps: 81 }).vatRappen);
    }
  });

  it("keeps null (pricing not live) and falls back to the default rate like the charge does", () => {
    expect(classCardRappen(null, 81)).toBeNull();
    expect(classCardRappen(undefined, 81)).toBeNull();
    expect(classCardRappen(10000, undefined)).toBe(charged(10000, Number.NaN, "economy"));
  });
});

describe("checkout quote parser", () => {
  it("every class view carries cardRappen = checkout total, totalRappen stays the net", () => {
    const body = {
      ok: true,
      quote_id: "q",
      lock: "l",
      vat_rate_bps: 81,
      pricing_live: true,
      classes: SLUGS.map((slug, i) => ({
        slug,
        eligible: true,
        total_rappen: NETS[i],
      })),
    };
    const r = parseQuoteJson(200, body);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.vatRateBps).toBe(81);
    r.classes.forEach((c, i) => {
      expect(c.totalRappen).toBe(NETS[i]);
      expect(c.cardRappen).toBe(charged(NETS[i]!, 81, c.slug));
    });
  });
});
