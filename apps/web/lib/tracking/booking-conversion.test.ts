import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_ADS_CONVERSION, sendBookingConversion } from "./booking-conversion";

// Node runner, no DOM: a bare window with an in-memory localStorage.
type W = { dataLayer?: unknown[]; gtag?: unknown; fbq?: unknown; localStorage: Storage };
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
} as unknown as Storage;
const window = { localStorage } as W;
(globalThis as unknown as { window: W }).window = window;
const NOW = Date.parse("2026-10-26T12:00:00Z");

describe("sendBookingConversion", () => {
  let gtag: ReturnType<typeof vi.fn>;
  let fbq: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    gtag = vi.fn();
    fbq = vi.fn();
    window.gtag = gtag;
    window.fbq = fbq;
  });

  it("sends Ads conversion, GA4 purchase and Meta Purchase with the charged CHF and the reference", () => {
    const sent = sendBookingConversion(
      { reference: "VT-26-0812", chargedRappen: 12345, paidAt: "2026-10-26T11:58:00Z" },
      NOW,
    );
    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: GOOGLE_ADS_CONVERSION,
      value: 123.45,
      currency: "CHF",
      transaction_id: "VT-26-0812",
    });
    expect(gtag).toHaveBeenCalledWith("event", "purchase", { transaction_id: "VT-26-0812", value: 123.45, currency: "CHF" });
    expect(fbq).toHaveBeenCalledWith("track", "Purchase", { value: 123.45, currency: "CHF" }, { eventID: "VT-26-0812" });
  });

  it("adds tax and the booked class as one item to the GA4 purchase only", () => {
    sendBookingConversion(
      {
        reference: "VT-26-0818",
        chargedRappen: 12345,
        paidAt: null,
        vatRappen: 925,
        vehicleClassSlug: "economy-sedan",
        vehicleClassName: "Economy Sedan",
      },
      NOW,
    );
    expect(gtag).toHaveBeenCalledWith("event", "purchase", {
      transaction_id: "VT-26-0818",
      value: 123.45,
      currency: "CHF",
      tax: 9.25,
      items: [{ item_id: "economy-sedan", item_name: "Economy Sedan", price: 123.45, quantity: 1 }],
    });
    expect(gtag.mock.calls[0]![2]).not.toHaveProperty("items");
    expect(fbq.mock.calls[0]![2]).toEqual({ value: 123.45, currency: "CHF" });
  });

  it("sends no tax when nothing was charged, and falls back to the slug as the item name", () => {
    sendBookingConversion(
      { reference: "VT-26-0819", chargedRappen: null, paidAt: null, vatRappen: 925, vehicleClassSlug: "economy-sedan" },
      NOW,
    );
    expect(gtag.mock.calls[1]![2]).toEqual({
      transaction_id: "VT-26-0819",
      value: 0,
      currency: "CHF",
      items: [{ item_id: "economy-sedan", item_name: "economy-sedan", price: 0, quantity: 1 }],
    });
  });

  it("sends once per reference in this browser", () => {
    const input = { reference: "VT-26-0813", chargedRappen: 5000, paidAt: null };
    expect(sendBookingConversion(input, NOW)).toBe(true);
    expect(sendBookingConversion(input, NOW)).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(2);
  });

  it("sends once per page load even when storage throws", () => {
    const broken = window.localStorage;
    window.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const input = { reference: "VT-26-0817", chargedRappen: 100, paidAt: null };
    expect(sendBookingConversion(input, NOW)).toBe(true);
    expect(sendBookingConversion(input, NOW)).toBe(false);
    window.localStorage = broken;
  });

  it("a voucher booking with nothing charged sends value 0", () => {
    sendBookingConversion({ reference: "VT-26-0814", chargedRappen: null, paidAt: null }, NOW);
    expect(gtag.mock.calls[0]![2]).toMatchObject({ value: 0, currency: "CHF" });
  });

  it("skips a visit more than a day after payment", () => {
    expect(sendBookingConversion({ reference: "VT-26-0815", chargedRappen: 100, paidAt: "2026-10-20T10:00:00Z" }, NOW)).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
    expect(fbq).not.toHaveBeenCalled();
  });

  it("queues on dataLayer when gtag.js has not defined gtag yet, and skips Meta when fbq is missing", () => {
    delete window.gtag;
    delete window.fbq;
    window.dataLayer = [];
    sendBookingConversion({ reference: "VT-26-0816", chargedRappen: 100, paidAt: null }, NOW);
    const q = window.dataLayer!.map((a) => Array.from(a as ArrayLike<unknown>));
    expect(q[0]!.slice(0, 2)).toEqual(["event", "conversion"]);
    expect(q[1]!.slice(0, 2)).toEqual(["event", "purchase"]);
  });
});
