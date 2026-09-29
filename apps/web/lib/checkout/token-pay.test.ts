import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function sliceFunction(src: string, name: string): string {
  const marker = name.startsWith("async ") ? name : `function ${name}`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${name}`);
}

const COPY = {
  en: {
    pricingNotLive: "Online booking is not open yet. Call dispatch.",
    quoteExpired: "This quote has expired. Get a new price.",
  },
  de: {
    pricingNotLive: "Online-Buchung ist noch nicht offen. Rufen Sie die Disposition an.",
    quoteExpired: "Dieses Angebot ist abgelaufen. Holen Sie einen neuen Preis.",
  },
  fr: {
    pricingNotLive: "La réservation en ligne n'est pas encore ouverte. Appelez la dispatch.",
    quoteExpired: "Ce devis a expiré. Demandez un nouveau prix.",
  },
  ar: {
    pricingNotLive: "الحجز عبر الإنترنت غير مفتوح بعد. اتصل بالتشغيل.",
    quoteExpired: "انتهت صلاحية هذا العرض. احصل على سعر جديد.",
  },
} as const;

describe("token pay refusal", () => {
  const src = read("../../app/[locale]/checkout/pay/[token]/PayClient.tsx");
  const zero = sliceFunction(src, "onPayLinkLockZero");
  // 26.1-16: the charge-gate table moved into the pure pay-link state mapper
  // that PayClient now reads every open answer through.
  const states = read("./pay-client-states.ts");
  const gate = sliceFunction(states, "chargeGateAlert");
  const pay = sliceFunction(src, "async function onPay");
  const timerStart = src.indexOf("if (!ready || !lockExpiresAt) return;");
  const timerEnd = src.indexOf("async function onPay");
  const timer = src.slice(timerStart, timerEnd);

  it("keeps recap refusal on alerts and shows no card fields (hosted Stripe page, 26.3 D-02)", () => {
    expect(src).toContain("quoteExpired");
    expect(src).toContain("pricingNotLive");
    expect(src).toContain('role="alert"');
    expect(src).not.toContain("data-checkout-dummy-fields");
    expect(src).not.toContain('placeholder="1234 1234 1234 1234"');
    expect(src).not.toContain('placeholder="CVC"');
    expect(src).not.toContain('t("requote")');
    expect(src).not.toContain("checkout.requote");
    expect(src).not.toContain("homeHref");
    expect(src).not.toContain("href=");
    expect(src).not.toContain('tone="accent"');
    expect(src).not.toContain("tone='accent'");
    expect(src).not.toContain("loadStripe");
    expect(src).not.toContain("@stripe/");
    expect(src).not.toContain("price_snapshots");
    expect(src.replaceAll("lock_expires_at", "")).not.toContain("expires_at");
  });

  it("does not set the charge-gate error to paymentWindowClosed", () => {
    expect(gate).toContain('code === "pricing_not_live"');
    expect(gate).toContain('"pricingNotLive"');
    expect(gate).toContain('code === "quote_expired"');
    expect(gate).toContain('"quoteExpired"');
    expect(gate).toContain("quoteAlreadyBooked");
    expect(gate).not.toContain("paymentWindowClosed");
    expect(gate).not.toContain("payCouldNotStart");
    expect(src).not.toContain(
      'quote_already_booked" ? "quoteAlreadyBooked" : "paymentWindowClosed"',
    );
    expect(states).not.toContain(
      'quote_already_booked" ? "quoteAlreadyBooked" : "paymentWindowClosed"',
    );
    expect(src).toContain("payStateFromOpen(json)");
    expect(src).not.toContain("function chargeGateAlert");
  });

  it("locks at lock_expires_at without restarting the clock, then leaves for the hosted page only when open", () => {
    expect(zero).toContain("lock_expires_at");
    expect(zero).toContain("locked");
    expect(zero).not.toContain("confirm");
    expect(zero.replaceAll("lock_expires_at", "")).not.toContain("expires_at");
    expect(zero).not.toContain("price_snapshots");
    expect(timerStart).toBeGreaterThan(-1);
    expect(timer).toContain("onPayLinkLockZero");
    expect(timer).toContain("setPayLocked(true)");
    expect(timer).toContain('"quoteExpired"');
    expect(timer).not.toContain("confirm");
    expect(timer).not.toContain('t("requote")');
    expect(timer).not.toContain("/api/checkout/intent");
    expect(timer.replaceAll("lock_expires_at", "")).not.toContain("expires_at");
    expect(timer).not.toContain("price_snapshots");
    expect(timer.indexOf("setPayLocked(true)")).toBeLessThan(timer.indexOf("expireStoredCheckoutSession"));
    const expire = sliceFunction(src, "expireStoredCheckoutSession");
    expect(expire).toContain('fetch("/api/checkout/lock-expire"');
    expect(expire).not.toContain("confirm");
    expect(expire).not.toContain('t("requote")');
    expect(expire).not.toContain("/api/checkout/intent");
    expect(expire.replaceAll("lock_expires_at", "")).not.toContain("expires_at");
    const guard = pay.indexOf("if (payLocked || !ready || opening) return;");
    const leave = pay.indexOf("window.location.assign(json.url)");
    expect(guard).toBeGreaterThan(-1);
    expect(leave).toBeGreaterThan(guard);
  });
});

describe("token alert copy", () => {
  for (const locale of ["en", "de", "fr", "ar"] as const) {
    it(`${locale} reuses the existing alert sentences`, () => {
      const messages = JSON.parse(read(`../../i18n/messages/${locale}.json`)) as {
        checkout: { pricingNotLive: string; quoteExpired: string };
      };
      expect(messages.checkout.pricingNotLive).toBe(COPY[locale].pricingNotLive);
      expect(messages.checkout.quoteExpired).toBe(COPY[locale].quoteExpired);
      if (locale === "de") {
        expect(messages.checkout.quoteExpired).not.toContain("ß");
        expect(messages.checkout.pricingNotLive).not.toContain("ß");
      }
    });
  }
});
