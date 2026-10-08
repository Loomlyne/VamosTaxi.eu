// J8: customer money copy and adaptive pricing (payments review W2-10, W3-07, W3-08, W3-09, W1-07).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import ar from "../../i18n/messages/ar.json";
import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import { checkoutPaymentMethodTypes, methodNoteKey } from "./payment-methods";
import { createCheckoutSession, fxFromSession } from "./stripe";

const web = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(web, rel), "utf8");
const all = { en, de, fr, ar } as const;
const LOCALES = ["en", "de", "fr", "ar"] as const;

describe("W2-10: Adaptive Pricing is off, the charge is always CHF", () => {
  function fakeStripe() {
    const create = (async () => ({ id: "cs_test_1" })) as unknown as Stripe["checkout"]["sessions"]["create"];
    const calls: unknown[][] = [];
    const client = { checkout: { sessions: { create: (...a: unknown[]) => { calls.push(a); return (create as never as (...x: unknown[]) => unknown)(...a); } } } } as unknown as Stripe;
    return { client, calls };
  }
  const base = {
    chargedRappen: 8000,
    bookingId: "00000000-0000-4000-8000-000000000001",
    bookingReference: "idem-aaaaaaaa",
    customerEmail: "a@example.test",
    locale: "de" as const,
    idempotencyKey: "idem-aaaaaaaa",
    expiresAt: new Date(Date.now() + 3600_000),
    uiMode: "hosted_page" as const,
    successUrl: "https://vamostaxi.site/api/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://vamostaxi.site/checkout",
    productName: "Airport transfer",
  };

  it("every session this code creates carries adaptive_pricing.enabled = false and a CHF price", async () => {
    const { client, calls } = fakeStripe();
    await createCheckoutSession(client, base);
    await createCheckoutSession(client, { ...base, extra: { extraId: "x1" } });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const params = call[0] as { adaptive_pricing: unknown; line_items: Array<{ price_data: { currency: string } }> };
      expect(params.adaptive_pricing).toEqual({ enabled: false });
      expect(params.line_items[0]!.price_data.currency).toBe("chf");
    }
  });

  it("no code path switches it on", () => {
    expect(src("lib/checkout/stripe.ts")).not.toMatch(/adaptive_pricing:\s*\{\s*enabled:\s*true/);
    expect(src("lib/ops/edit-request.ts")).not.toMatch(/adaptive_pricing/);
  });

  it("a session created while it was on (EUR presentment) is still read the same way", () => {
    const old = {
      currency: "chf",
      amount_total: 8000,
      created: 1_790_000_000,
      presentment_details: { presentment_amount: 9000, presentment_currency: "eur" },
    } as unknown as Stripe.Checkout.Session;
    const fx = fxFromSession(old);
    expect(fx).toMatchObject({ chargedCurrency: "EUR", fxRate: 1.125, fxSource: "stripe_adaptive_pricing", presentmentAmountMinor: 9000 });
    // and a new CHF-only session has no presentment at all
    expect(fxFromSession({ currency: "chf", amount_total: 8000 } as unknown as Stripe.Checkout.Session)).toMatchObject({
      chargedCurrency: "CHF",
      fxRate: null,
      presentmentCurrency: null,
    });
  });
});

describe("W3-07: the checkout says what is charged when the total is shown in another currency", () => {
  it("PayBar renders the note only when one is passed, and the rail/bar pass it for a converted total only", () => {
    const bar = src("components/checkout/PayBar.tsx");
    expect(bar).toContain("data-co-charge-note");
    const rail = src("app/[locale]/checkout/sections/SummaryRail.tsx");
    expect(rail).toContain('f.displayAmount(100).currency !== "CHF"');
    expect(rail).toContain('t("chargeIn"');
    expect(rail).toContain('t("chargeCurrencyName")');
  });

  it("the sentence reads in all four languages, naming Swiss francs and CHF", () => {
    for (const locale of LOCALES) {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      const line = String(t("chargeIn", { currency: `${t("chargeCurrencyName")} (CHF)` }));
      expect(line, locale).toContain("(CHF)");
      expect(line, locale).not.toContain("{");
      if (locale === "ar") expect(line).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("W3-08: TWINT is named only while it is on", () => {
  it("the flag decides the methods, the note and the footer mark", () => {
    expect(checkoutPaymentMethodTypes({ STRIPE_CHECKOUT_TWINT: "off" })).toEqual(["card"]);
    expect(checkoutPaymentMethodTypes({})).toEqual(["card"]);
    expect(checkoutPaymentMethodTypes({ STRIPE_CHECKOUT_TWINT: "on" })).toEqual(["card", "twint"]);
    expect(methodNoteKey(false)).toBe("methodNoteNoTwint");
    expect(methodNoteKey(true)).toBe("methodNote");
  });

  it("the no-TWINT note never says TWINT, in four languages; the TWINT one still does", () => {
    for (const locale of LOCALES) {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      expect(String(t("methodNoteNoTwint")), locale).not.toMatch(/twint/i);
      expect(String(t("methodNote")), locale).toMatch(/twint/i);
      expect(String(t("methodNoteNoTwint")).length).toBeGreaterThan(20);
    }
  });

  it("the footer mark is off by default and the locale layout passes the flag", () => {
    const footer = src("components/shell/SiteFooter.tsx");
    expect(footer).toContain("showTwint = false");
    expect(footer).toMatch(/showTwint \? <span data-ft-paymark="1">\{tFooter\("payment-twint"\)\}<\/span> : null/);
    const layout = src("app/[locale]/layout.tsx");
    expect(layout).toContain("<SiteFooter showTwint={twintOffered()} />");
    expect(layout).toContain('checkoutPaymentMethodTypes(env).includes("twint")');
    // any doubt (no Worker env) is "off"
    expect(layout).toMatch(/catch \{\s*return false;/);
  });

  it("the checkout layout hands the server flag to the page", () => {
    expect(src("app/[locale]/checkout/layout.tsx")).toContain('twintOn: env ? checkoutPaymentMethodTypes(env).includes("twint") : false');
    expect(src("app/[locale]/checkout/CheckoutSettings.tsx")).toContain("twintOn: boolean");
  });
});

describe("W3-09: no payout date is shown to the customer", () => {
  it("the voucher and the manage page carry the arrival sentence, not 'Stripe pays out on'", () => {
    for (const rel of ["components/booking/BookingVoucher.tsx", "../../app/vamos-manage-ticket.js"]) {
      const text = src(rel);
      expect(text, rel).not.toContain("stripePayoutOn");
      expect(text, rel).not.toContain("Stripe pays out on");
    }
    expect(src("components/booking/BookingVoucher.tsx")).toContain('t("refundArrivalNote")');
  });

  it("the arrival sentence exists in four languages and promises no date or amount of days", () => {
    for (const locale of LOCALES) {
      const t = createTranslator({ locale, messages: all[locale], namespace: "checkout" });
      const line = String(t("refundArrivalNote"));
      expect(line.length, locale).toBeGreaterThan(15);
      expect(line, locale).not.toMatch(/\d/);
      expect((all[locale].checkout as Record<string, string>).stripePayoutOn, locale).toBeUndefined();
    }
    const dict = readFileSync(join(web, "../../app/vamos-i18n-dict.js"), "utf8");
    expect(dict).toContain("'It can take a few business days to reach your card.': { de:");
    expect(dict).not.toContain("'Stripe pays out on {date}.'");
  });
});

describe("W1-07: the browser context carries no Stripe key", () => {
  it("the checkout settings and layout have no publishable key; the server-side mode comparison is untouched", () => {
    expect(src("app/[locale]/checkout/CheckoutSettings.tsx")).not.toMatch(/publishableKey|pk_/);
    expect(src("app/[locale]/checkout/layout.tsx")).not.toMatch(/publishableKey|STRIPE_PUBLISHABLE_KEY/);
    // the health-probe comparison reads the key on the server (J1)
    expect(src("lib/checkout/stripe-mode.ts")).toContain("STRIPE_PUBLISHABLE_KEY");
  });
});

describe("W1-13: Arabic on Stripe's Checkout (left as is, unverified)", () => {
  it("the SDK's own Locale list has no 'ar'; the code still sends it and retries with 'en' on a refusal", () => {
    const sdk = readFileSync(join(web, "node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts"), "utf8");
    const list = /type Locale = ([^;]+);/.exec(sdk)?.[1] ?? "";
    expect(list).toContain("'de'");
    expect(list).not.toContain("'ar'");
    expect(src("lib/checkout/stripe.ts")).toContain('input.locale === "ar" && isLocaleRefusal(err)');
  });
});
