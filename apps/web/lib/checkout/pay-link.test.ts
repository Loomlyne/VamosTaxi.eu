import { describe, expect, it } from "vitest";
import {
  companyReady,
  confirmationRecipients,
  emailExtrasFromLines,
  emailExtrasFromPolicy,
  extrasFromPolicy,
  payLinkEmailFromLock,
  payLinkExtras,
  payLinkPath,
  payLinkSentAt,
} from "./pay-link";

describe("payLinkPath", () => {
  it("is locale-aware and does not put VAT in the URL", () => {
    expect(payLinkPath("en", "tok")).toBe("/checkout/pay/tok");
    expect(payLinkPath("de", "tok")).toBe("/de/checkout/pay/tok");
    expect(payLinkPath("en", "tok")).not.toMatch(/vat|VAT|mwst/i);
  });
});

describe("payLinkSentAt", () => {
  it("does not restart the 24h clock on resend (D-37)", () => {
    expect(payLinkSentAt("2026-09-07T10:00:00.000Z", "2026-09-07T18:00:00.000Z")).toBe(
      "2026-09-07T10:00:00.000Z",
    );
    expect(payLinkSentAt(null, "2026-09-07T10:00:00.000Z")).toBe("2026-09-07T10:00:00.000Z");
  });
});

describe("confirmationRecipients", () => {
  it("mails passenger and payer when they differ (D-38)", () => {
    expect(confirmationRecipients("a@x.com", "a@x.com")).toEqual(["a@x.com"]);
    expect(confirmationRecipients("a@x.com", "finance@x.com")).toEqual(["a@x.com", "finance@x.com"]);
  });
});

describe("companyReady", () => {
  it("requires name, address, VAT for company (D-36)", () => {
    expect(companyReady({ kind: "individual", name: "", address: "", vat: "" })).toBe(true);
    expect(companyReady({ kind: "company", name: "Acme", address: "Zürich", vat: "CHE-123" })).toBe(
      true,
    );
    expect(companyReady({ kind: "company", name: "Acme", address: "", vat: "CHE-123" })).toBe(false);
  });
});

describe("payLinkEmailFromLock", () => {
  it("copies pickup dropoff extras from the lock, never empty placeholders", () => {
    expect(payLinkExtras({ child_seats: 1, oversized_luggage: true, extra_stops: 1 })).toEqual([
      "child_seat",
      "oversized_luggage",
      "extra_stop",
    ]);
    const mail = payLinkEmailFromLock({
      reference: "VT-10001",
      locale: "en",
      payUrl: "https://vamostaxi.site/checkout/pay/tok",
      totalRappen: null,
      payload: {
        v: 1,
        quote_id: "00000000-0000-4000-8000-000000000001",
        exp: "2099-01-01T12:00:00.000Z",
        engine_version: "0.0.0-test",
        rate_version_id: null,
        settings_version_id: 1,
        computed_at: "2026-08-28T10:00:00.000Z",
        display_currency: "CHF",
        mode: "one_way",
        pax: 2,
        bags: 1,
        legs: [
          {
            leg_seq: 1,
            pickup: { lng: 8.55, lat: 47.45, text: "ZRH Arrivals" },
            dropoff: { lng: 8.54, lat: 47.37, text: "Bahnhofstrasse" },
            scheduled_local: "2026-09-22T19:55",
            distance_m: 12000,
            duration_s: 1200,
            origin_zone_id: null,
            dest_zone_id: null,
            waypoints: [],
            flight_no: "LX123",
            landing_source: null,
          },
        ],
        extras: { child_seats: 1 },
        coupon: null,
        class_totals: [{ slug: "business", total_rappen: null }],
      },
      vehicleClass: "business",
      extras: { child_seats: 1 },
      coupon: null,
      contactName: "Ada",
      contactPhone: "+41 79 000 00 00",
      companyName: "",
      companyAddress: "",
      companyVat: "",
    });
    expect(mail.pickupText).toBe("ZRH Arrivals");
    expect(mail.dropoffText).toBe("Bahnhofstrasse");
    expect(mail.flightNo).toBe("LX123");
    expect(mail.extras).toEqual([
      {
        name: "Child seat",
        names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد طفل" },
        amountRappen: null,
      },
    ]);
    expect(mail.payUrl).toContain("/checkout/pay/");
  });
});

describe("extrasFromPolicy", () => {
  it("reads extras from snapshot policy and ignores junk", () => {
    expect(extrasFromPolicy({ extras: ["child_seat", "nope", "child_seat"] })).toEqual([
      "child_seat",
    ]);
    expect(extrasFromPolicy({ extras: ["oversized_luggage", "extra_stop"] })).toEqual([
      "oversized_luggage",
      "extra_stop",
    ]);
    expect(extrasFromPolicy({ extras: { child_seats: 1, oversized_luggage: true } })).toEqual([
      "child_seat",
      "oversized_luggage",
    ]);
    expect(extrasFromPolicy(null)).toEqual([]);
  });
});

describe("emailExtrasFromLines", () => {
  const lines = [
    { kind: "fare", code: "fare", amount_rappen: 10000 },
    {
      kind: "surcharge",
      code: "ski-rack",
      params: { names: { en: "Ski rack", de: "Skiträger" } },
      amount_rappen: 2000,
    },
    { kind: "surcharge", code: "baby_seat", params: { name: "Baby seat" }, amount_rappen: 1500 },
    { kind: "surcharge", code: "night", amount_rappen: 0 },
    { kind: "coupon", code: "coupon", amount_rappen: -1000 },
    { kind: "vat", code: "vat", amount_rappen: 950 },
  ];

  it("returns one entry per surcharge line with its own names, not a closed list", () => {
    expect(emailExtrasFromLines(lines, "de")).toEqual([
      { name: "Skiträger", names: { en: "Ski rack", de: "Skiträger" }, amountRappen: 2000 },
      { name: "Baby seat", names: {}, amountRappen: 1500 },
    ]);
  });

  it("falls back to English, then the humanised code", () => {
    expect(emailExtrasFromLines(lines, "fr")[0]?.name).toBe("Ski rack");
    expect(emailExtrasFromLines([{ kind: "surcharge", code: "roof-box", amount_rappen: 500 }], "en")[0]?.name).toBe(
      "Roof box",
    );
  });

  it("reads nothing from junk", () => {
    expect(emailExtrasFromLines(null, "en")).toEqual([]);
  });

  it("legacy policy codes keep their three-language names", () => {
    expect(emailExtrasFromPolicy(["extra_stop"])[0]?.names?.de).toBe("Zwischenstopp");
  });
});
