import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("pay land blocked", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const payblockStart = client.indexOf('className="vt-checkout__payblock"');
  const payfoot = client.indexOf('className="vt-checkout__payfoot"', payblockStart);
  const payblock = client.slice(payblockStart, payfoot);

  it("paints dummy fields and an alert, and does not mount PaymentPanel on that branch", () => {
    expect(payblock).toContain("data-checkout-dummy-fields");
    expect(payblock).toContain('role="alert"');
    expect(payblock).toContain('tone={paySheetAlert === "pricingNotLive" ? "info" : "danger"}');
    expect(payblock).not.toContain('tone="accent"');
    expect(payblock).not.toContain("tone=\"accent\"");
    expect(payblock).toContain("showDummyFields ? (");
    const branch = payblock.slice(payblock.indexOf("showDummyFields ? ("), payblock.indexOf(") : ("));
    expect(branch).toContain("data-checkout-dummy-fields");
    expect(branch).not.toContain("PaymentPanel");
    expect(branch).not.toContain("loadStripe");
    expect(branch).toContain('t("payWithCard")');
    expect(branch).toContain('name="credit-card"');
    expect(branch).toContain("size={16}");
    expect(branch).toContain('value="CH"');
    expect(branch).toContain("disabled");
    expect(branch).toContain('placeholder="1234 1234 1234 1234"');
    expect(branch).toContain('placeholder="MM / YY"');
    expect(branch).toContain('placeholder="CVC"');
  });

  it("returns before startPayment when the class is not selectable or the lock is past", () => {
    const start = client.indexOf("useEffect(() => {", client.indexOf("intentAttempts"));
    const end = client.indexOf("async function continueTrip", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const effect = client.slice(start, end);
    const gate = effect.indexOf("classIsSelectable");
    const past = effect.indexOf("lockExpired");
    const pay = effect.indexOf("startPayment(");
    expect(gate).toBeGreaterThan(-1);
    expect(past).toBeGreaterThan(-1);
    expect(pay).toBeGreaterThan(gate);
    expect(effect.indexOf("return;", gate)).toBeLessThan(pay);
    expect(effect).toContain('setRefusal(past ? "quoteExpired" : "pricingNotLive")');
    expect(effect).not.toContain("paymentWindowClosed");
    expect(effect).not.toContain("payCouldNotStart");
  });

  it("does not let onPay replace pricingNotLive or quoteExpired", () => {
    const start = client.indexOf("async function onPay");
    const end = client.indexOf("const requote =", start);
    const body = client.slice(start, end);
    expect(body.indexOf('refusal === "pricingNotLive" || refusal === "quoteExpired"')).toBeLessThan(
      body.indexOf("startPayment("),
    );
    expect(body).toContain('current === "pricingNotLive" || current === "quoteExpired" ? current');
  });

  it("keeps 21-02 classIsSelectable wiring", () => {
    const start = client.indexOf("async function continueDetails");
    const end = client.indexOf("async function startPayment", start);
    const body = client.slice(start, end);
    expect(body).toContain("classIsSelectable");
    expect(body).toContain("peekLockClassRappen");
    expect(body).not.toContain('setRefusal("pricingNotLive")');
  });

  it("onQuoteLockZero does not mint and the timer reads expires_at", () => {
    const start = client.indexOf("function onQuoteLockZero");
    const end = client.indexOf("function validate", start);
    expect(start).toBeGreaterThan(-1);
    const block = client.slice(start, end);
    const handlerEnd = block.indexOf("useEffect");
    const handler = block.slice(0, handlerEnd);
    expect(handler).toContain('setRefusal("quoteExpired")');
    expect(handler).not.toContain("/api/checkout/intent");
    expect(handler).not.toContain("QUOTE_LOCK_MINUTES");
    expect(handler).not.toContain("price_snapshots");
    expect(handler).not.toContain("startPayment");
    expect(handler).not.toContain("clientSecretRef");
    expect(block).toContain("tripSnap?.expires_at");
    expect(block).toContain("readVamosTrip()?.expires_at");
    expect(block).toContain("window.setTimeout(onQuoteLockZero");
    expect(block).not.toContain("/api/checkout/intent");
    expect(block).not.toContain("QUOTE_LOCK_MINUTES");
    expect(block).not.toContain("price_snapshots");
    expect(block).not.toContain("startPayment");
    expect(client).not.toContain("QUOTE_LOCK_MINUTES");
    expect(client).not.toContain("price_snapshots");
  });
});

describe("pay sheet requote", () => {
  const client = source("app/[locale]/checkout/CheckoutClient.tsx");
  const payblockStart = client.indexOf('className="vt-checkout__payblock"');
  const payfoot = client.indexOf('className="vt-checkout__payfoot"', payblockStart);
  const payblock = client.slice(payblockStart, payfoot);

  it("posts requote and does not use href={homeHref}", () => {
    const alertStart = payblock.indexOf('role="alert"');
    const alertEnd = payblock.indexOf("</Alert>", alertStart);
    const alert = payblock.slice(alertStart, alertEnd);
    expect(alert).toContain('t("requote")');
    expect(alert).toContain('variant="ghost"');
    expect(alert).toContain('size="md"');
    expect(alert).toContain("sentenceCase");
    expect(alert).toContain("flexWrap: \"wrap\"");
    expect(alert).not.toContain("href={homeHref}");
    expect(alert).not.toContain("href=");
    const start = client.indexOf("async function onCheckoutRequote");
    const end = client.indexOf("const railPickup", start);
    const handler = client.slice(start, end);
    expect(handler).toContain('fetch("/api/checkout/requote"');
    expect(handler).toContain("quote_id: quoteId");
    expect(handler).toContain('json.ok !== true');
    expect(handler).toContain('removeItem("vamosTrip")');
    expect(handler).toContain('removeItem("vamosQuoteLock")');
    expect(handler.indexOf('json.ok !== true')).toBeLessThan(handler.indexOf("removeItem"));
    expect(handler.indexOf("removeItem")).toBeLessThan(handler.indexOf("router.push(homeHref)"));
    expect(handler).not.toContain("payCouldNotStart");
    expect(handler).not.toContain("/api/checkout/abandon");
    const rail = client.indexOf("data-checkout-rail");
    expect(client.slice(rail)).toContain("href={homeHref}");
    expect(client.slice(rail)).toContain('size="sm"');
  });
});

describe("pay lock zero panel", () => {
  const panel = source("app/[locale]/checkout/PaymentPanel.tsx");

  it("locks the mounted wrapper and does not load Stripe again", () => {
    expect(panel).toContain('data-pay-locked={locked ? "true" : undefined}');
    expect(panel).toContain('aria-disabled={locked || undefined}');
    expect(panel).toContain("pointerEvents: \"none\"");
    expect(panel).toContain("if (locked) return;");
    const stripe = panel.indexOf("function browserStripe");
    const call = panel.indexOf("loadStripe(");
    expect(stripe).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(stripe);
    expect(panel.indexOf("loadStripe(", call + 1)).toBe(-1);
    expect(panel).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || publishableKey");
  });
});
