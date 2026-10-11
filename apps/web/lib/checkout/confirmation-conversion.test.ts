// The Google Ads conversion decision (owner decisions 2026-10-09, D4).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONVERSION_RECENT_MS, confirmationConversion, type ConversionFacts } from "./confirmation-conversion";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const base: ConversionFacts = {
  status: "confirmed",
  paymentStatus: "succeeded",
  chargedRappen: 9979,
  priceTotalRappen: 9979,
  onReturnPath: true,
  returnPhase: "booked",
  reference: "VT-26-07331",
  paidAt: null,
  nowMs: NOW,
};

describe("confirmationConversion", () => {
  it("a confirmed booking on the return path: the charged amount in francs and the real reference", () => {
    expect(confirmationConversion(base)).toEqual({ value: 99.79, transactionId: "VT-26-07331" });
  });

  it.each(["confirmed", "assigned", "paid"])("status %s counts", (status) => {
    expect(confirmationConversion({ ...base, status })).not.toBeNull();
  });

  it.each(["pending", "quote", "cancelled", "refunded", "no_show", "completed", "partially_cancelled"])("status %s does not", (status) => {
    expect(confirmationConversion({ ...base, status, paymentStatus: status === "pending" ? "processing" : "succeeded" })).toBeNull();
  });

  it("waits while the return path still shows the loading screens", () => {
    for (const returnPhase of ["confirming", "received", null]) {
      expect(confirmationConversion({ ...base, returnPhase })).toBeNull();
    }
  });

  it("the charged amount wins; the booking total is the fallback; no amount, no conversion", () => {
    expect(confirmationConversion({ ...base, chargedRappen: 12050, priceTotalRappen: 9979 })!.value).toBe(120.5);
    expect(confirmationConversion({ ...base, chargedRappen: null })!.value).toBe(99.79);
    expect(confirmationConversion({ ...base, chargedRappen: null, priceTotalRappen: null })).toBeNull();
    for (const bad of [0, -1, 1.5, NaN]) expect(confirmationConversion({ ...base, chargedRappen: bad, priceTotalRappen: null }), String(bad)).toBeNull();
  });

  it("a reference that is not a booking reference: nothing", () => {
    for (const reference of ["", "VT-26-1", "a@b.com", "vt-26-07331", "VT-26-07331x"]) {
      expect(confirmationConversion({ ...base, reference }), reference).toBeNull();
    }
  });

  describe("a page that is not the return from payment (a later visit, another device)", () => {
    const later = { ...base, onReturnPath: false, returnPhase: null };
    it("counts only a payment captured within the hour", () => {
      expect(confirmationConversion({ ...later, paidAt: new Date(NOW - 5 * 60_000).toISOString() })).not.toBeNull();
      expect(confirmationConversion({ ...later, paidAt: new Date(NOW - CONVERSION_RECENT_MS - 1000).toISOString() })).toBeNull();
      expect(confirmationConversion({ ...later, paidAt: new Date(NOW - 3 * 86_400_000).toISOString() })).toBeNull();
    });
    it("no paid time, a garbage one, or one far in the future: nothing", () => {
      for (const paidAt of [null, undefined, "", "yesterday", new Date(NOW + 3_600_000).toISOString()]) {
        expect(confirmationConversion({ ...later, paidAt }), String(paidAt)).toBeNull();
      }
    });
  });
});

describe("the page", () => {
  const src = readFileSync(resolve(__dirname, "../../app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"), "utf8");
  it("reports through the loader only, once per value, and never sends an address or a name", () => {
    // One direct call when the loader is there, else one push onto the queue the loader drains (CR-01, 2026-10-11).
    expect(src.match(/VamosGoogle\.conversion\(/g)).toHaveLength(1);
    expect(src.match(/VamosGoogleQueue/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(src.match(/q\.push\(item\)/g)).toHaveLength(1);
    expect(src).toContain("confirmationConversion({");
    const effect = src.slice(src.indexOf("const conversionValue"), src.indexOf('if (initialPhase === "hidden")'));
    expect(effect).toContain("[conversionValue, reference]");
    for (const forbidden of ["contactEmail", "contactName", "contactPhone", "pickupText", "dropoffText", "flightNo"]) {
      expect(effect.includes(forbidden), forbidden).toBe(false);
    }
    // The hook sits before every early return of the component (rules of hooks).
    expect(src.indexOf("const conversionValue")).toBeLessThan(src.indexOf('if (initialPhase === "hidden")'));
  });
});
