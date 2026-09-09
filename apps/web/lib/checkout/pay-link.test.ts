import { describe, expect, it } from "vitest";
import {
  companyReady,
  confirmationRecipients,
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
    expect(mail.extras).toEqual(["child_seat"]);
    expect(mail.payUrl).toContain("/checkout/pay/");
  });
});
