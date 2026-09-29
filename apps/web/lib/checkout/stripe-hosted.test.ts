import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WEB_CHECKOUT_MINUTES,
  allSessionsExpiredUnpaid,
  checkoutPaymentMethodTypes,
  createCheckoutSession,
  fxFromSession,
  hostedSessionIsPayable,
} from "./stripe";

const here = dirname(fileURLToPath(import.meta.url));
const SUCCESS = "https://vamostaxi.site/api/checkout/return?locale=en&session_id={CHECKOUT_SESSION_ID}";
const CANCEL = "https://vamostaxi.site/checkout?resume=q1";

function fake() {
  const create = vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.test/x" });
  return { create, client: { checkout: { sessions: { create } } } as unknown as Stripe };
}

function base(over: Record<string, unknown> = {}) {
  return {
    chargedRappen: 8000,
    bookingId: "00000000-0000-4000-8000-000000000001",
    bookingReference: "VT-26-0001",
    customerEmail: "guest@example.test",
    locale: "en" as const,
    idempotencyKey: "idem-1",
    expiresAt: new Date(Date.now() + WEB_CHECKOUT_MINUTES * 60_000),
    productName: "Airport transfer",
    uiMode: "hosted_page" as const,
    successUrl: SUCCESS,
    cancelUrl: CANCEL,
    ...over,
  };
}

describe("hosted createCheckoutSession", () => {
  it("builds hosted_page params with card only, Link off, no promo codes", async () => {
    const { client, create } = fake();
    const before = Math.floor(Date.now() / 1000);
    await createCheckoutSession(client, base());
    const p = create.mock.calls[0]![0] as Record<string, any>;
    expect(p.ui_mode).toBe("hosted_page");
    expect(p.success_url).toBe(SUCCESS);
    expect(p.success_url.endsWith("session_id={CHECKOUT_SESSION_ID}")).toBe(true);
    expect(p.cancel_url).toBe(CANCEL);
    expect(p).not.toHaveProperty("return_url");
    expect(p.payment_method_types).toEqual(["card"]);
    expect(p.wallet_options).toEqual({ link: { display: "never" } });
    expect(p.adaptive_pricing).toEqual({ enabled: true });
    expect(p).not.toHaveProperty("allow_promotion_codes");
    expect(p.expires_at).toBeGreaterThanOrEqual(before + 31 * 60 - 1);
    expect(p.expires_at).toBeLessThanOrEqual(before + 31 * 60 + 3);
    expect(p.line_items[0].price_data.unit_amount).toBe(8000);
  });

  it("adds twint only when asked", async () => {
    const { client, create } = fake();
    await createCheckoutSession(client, base({ twint: true }));
    expect((create.mock.calls[0]![0] as any).payment_method_types).toEqual(["card", "twint"]);
    expect(checkoutPaymentMethodTypes({})).toEqual(["card"]);
    expect(checkoutPaymentMethodTypes({ STRIPE_CHECKOUT_TWINT: "off" })).toEqual(["card"]);
    expect(checkoutPaymentMethodTypes({ STRIPE_CHECKOUT_TWINT: "on" })).toEqual(["card", "twint"]);
  });

  it("refuses non-http URLs and a success URL without the session placeholder", async () => {
    const { client } = fake();
    await expect(createCheckoutSession(client, base({ successUrl: "javascript:alert(1)" }))).rejects.toThrow();
    await expect(createCheckoutSession(client, base({ cancelUrl: "/relative" }))).rejects.toThrow();
    await expect(
      createCheckoutSession(client, base({ successUrl: "https://vamostaxi.site/x" })),
    ).rejects.toThrow(/CHECKOUT_SESSION_ID/);
  });

  it("no longer offers an embedded (elements) session at all (D-48)", async () => {
    const { client, create } = fake();
    await createCheckoutSession(client, base());
    const p = create.mock.calls[0]![0] as Record<string, any>;
    expect(p.ui_mode).toBe("hosted_page");
    expect(p).not.toHaveProperty("return_url");
    expect(p.payment_intent_data).toEqual({ metadata: { quote_id: base().bookingId } });
    const src = readFileSync(join(here, "stripe.ts"), "utf8");
    expect(src).not.toMatch(/ui_mode: "elements"|returnUrl/);
  });

  it("sends ar first, retries once with en on a locale refusal, same key", async () => {
    const { client, create } = fake();
    create
      .mockRejectedValueOnce({ type: "StripeInvalidRequestError", param: "locale" })
      .mockResolvedValueOnce({ id: "cs_test_2", url: "u" });
    const s = await createCheckoutSession(client, base({ locale: "ar" }));
    expect(s.id).toBe("cs_test_2");
    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[0]![0] as any).locale).toBe("ar");
    expect((create.mock.calls[1]![0] as any).locale).toBe("en");
    expect(create.mock.calls[1]![1]).toEqual({ idempotencyKey: "idem-1" });
  });

  it("rethrows any other error and does not retry non-ar locales", async () => {
    const { client, create } = fake();
    create.mockRejectedValue({ type: "StripeInvalidRequestError", param: "line_items" });
    await expect(createCheckoutSession(client, base({ locale: "ar" }))).rejects.toBeTruthy();
    expect(create).toHaveBeenCalledTimes(1);
    create.mockReset();
    create.mockRejectedValue({ type: "StripeInvalidRequestError", param: "locale" });
    await expect(createCheckoutSession(client, base({ locale: "de" }))).rejects.toBeTruthy();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("allSessionsExpiredUnpaid", () => {
  const ret = (map: Record<string, any>) => async (id: string) => {
    if (map[id] === "boom") throw new Error("net");
    return map[id];
  };
  it("is true only when every session is expired and unpaid", async () => {
    const dead = { status: "expired", payment_status: "unpaid" };
    expect(await allSessionsExpiredUnpaid(["a", "b"], ret({ a: dead, b: dead }))).toBe(true);
    expect(await allSessionsExpiredUnpaid([], ret({}))).toBe(true);
    expect(await allSessionsExpiredUnpaid(["a", "b"], ret({ a: dead, b: { status: "open", payment_status: "unpaid" } }))).toBe(false);
    expect(await allSessionsExpiredUnpaid(["a"], ret({ a: { status: "complete", payment_status: "paid" } }))).toBe(false);
    expect(await allSessionsExpiredUnpaid(["a"], ret({ a: { status: "complete", payment_status: "unpaid" } }))).toBe(false);
    expect(await allSessionsExpiredUnpaid(["a", "b"], ret({ a: dead, b: "boom" }))).toBe(false);
  });
});

describe("hostedSessionIsPayable", () => {
  const ok = { status: "open", url: "https://c.stripe.test/x", currency: "chf", amount_total: 8000 } as unknown as Stripe.Checkout.Session;
  it("checks status, url, currency and amount", () => {
    expect(hostedSessionIsPayable(ok, 8000)).toBe(true);
    expect(hostedSessionIsPayable({ ...ok, url: null } as any, 8000)).toBe(false);
    expect(hostedSessionIsPayable({ ...ok, status: "expired" } as any, 8000)).toBe(false);
    expect(hostedSessionIsPayable(ok, 9000)).toBe(false);
    expect(hostedSessionIsPayable({ ...ok, currency: "eur" } as any, 8000)).toBe(false);
    expect(hostedSessionIsPayable(null, 8000)).toBe(false);
  });
});

describe("fxFromSession presentment", () => {
  const s = (o: Record<string, unknown>) => ({ currency: "chf", ...o }) as unknown as Stripe.Checkout.Session;
  it("reads presentment_details", () => {
    const fx = fxFromSession(s({ amount_total: 8000, presentment_details: { presentment_amount: 9000, presentment_currency: "eur" } }));
    expect(fx.presentmentAmountMinor).toBe(9000);
    expect(fx.presentmentCurrency).toBe("EUR");
  });
  it("gives all four fx columns together (booking_payments_fx_complete)", () => {
    const fx = fxFromSession(
      s({ amount_total: 8000, created: 1_790_000_000, presentment_details: { presentment_amount: 9000, presentment_currency: "eur" } }),
    );
    expect(fx.chargedCurrency).toBe("EUR");
    expect(fx.fxRate).toBe(1.125);
    expect(fx.fxSource).toBe("stripe_adaptive_pricing");
    expect(fx.fxQuotedAt).toBe(new Date(1_790_000_000 * 1000).toISOString());
    expect(fx.presentmentAmountMinor).toBe(9000);
  });
  it("keeps CHF and only the presentment currency for a currency the table does not allow", () => {
    const fx = fxFromSession(
      s({ amount_total: 8000, presentment_details: { presentment_amount: 7000, presentment_currency: "gbp" } }),
    );
    expect(fx.chargedCurrency).toBe("CHF");
    expect(fx.fxRate).toBeNull();
    expect(fx.presentmentAmountMinor).toBeNull();
    expect(fx.presentmentCurrency).toBe("GBP");
  });
  it("drops the group but keeps the currency when no rate can be derived", () => {
    const fx = fxFromSession(s({ presentment_details: { presentment_amount: 9000, presentment_currency: "eur" } }));
    expect(fx.fxRate).toBeNull();
    expect(fx.fxSource).toBeNull();
    expect(fx.fxQuotedAt).toBeNull();
    expect(fx.presentmentAmountMinor).toBeNull();
    expect(fx.presentmentCurrency).toBe("EUR");
  });
  it("is null for a CHF presentment", () => {
    const fx = fxFromSession(s({ presentment_details: { presentment_amount: 8000, presentment_currency: "chf" } }));
    expect(fx.presentmentAmountMinor).toBeNull();
    expect(fx.presentmentCurrency).toBeNull();
  });
  it("falls back to currency_conversion", () => {
    const fx = fxFromSession(s({ currency_conversion: { fx_rate: "1.1", amount_total: 8800, source_currency: "chf" } }));
    expect(fx.presentmentAmountMinor).toBe(8800);
    expect(fx.fxRate).toBe(1.1);
    expect(fx.fxQuotedAt).not.toBeNull();
  });
});
