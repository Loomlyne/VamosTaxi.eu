import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
const placeCombo = readFileSync(join(WEB_ROOT, "components/forms/PlaceCombo.tsx"), "utf8");
const payPanel = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/PaymentPanel.tsx"), "utf8");
const fab = readFileSync(join(WEB_ROOT, "components/shell/ContactFab.tsx"), "utf8");
const classes = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClassCards.tsx"), "utf8");
const css = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/checkout.css"), "utf8");
const layout = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/layout.tsx"), "utf8");
const route = readFileSync(join(WEB_ROOT, "components/transfer/RouteSummary.css"), "utf8");
const header = readFileSync(join(WEB_ROOT, "components/shell/SiteHeader.tsx"), "utf8");
const account = readFileSync(join(WEB_ROOT, "components/shell/SiteHeaderAccount.tsx"), "utf8");
const shell = readFileSync(join(WEB_ROOT, "components/shell/SiteShell.tsx"), "utf8");
const contact = readFileSync(join(WEB_ROOT, "components/booking/ContactFields.tsx"), "utf8");

describe("checkout comment pack", () => {
  it("shows class photography on trip", () => {
    expect(classes).toContain("/assets/photography/class-economy.jpg");
    expect(classes).toContain("/assets/photography/class-van.jpg");
    expect(client).toContain("CheckoutClassCards");
    expect(css).toContain("block-size: 160px");
  });

  it("reuses booking PlaceCombo and WhenPicker on trip", () => {
    expect(client).toContain("PlaceCombo");
    expect(client).toContain("WhenPicker");
    expect(client).toContain("hideTime");
    expect(client).toContain('label={tBooking("date")}');
    expect(client).toContain("vt-checkout__when-split");
    expect(client).toContain("TimePicker");
    expect(placeCombo).toContain("/api/geo/suggest");
    expect(placeCombo).toContain("session_token");
  });

  it("uses the locked-plus phone field and refuses bad email", () => {
    expect(contact).toContain("PhoneField");
    expect(contact).toContain("isCheckoutEmail");
    expect(contact).toContain("CHECKOUT_EMAIL_RE");
  });

  it("uses block tabs for guest and pay method, billing only on payment", () => {
    expect(client).toContain("continue-as-guest");
    expect(client).toContain("billingIndividual");
    expect(client).toContain("payNow");
    expect(client).toContain("payLinkTab");
    expect(client).toContain("block");
    expect(client).not.toMatch(/name=["']acct["']/);
    expect(client.indexOf("billingIndividual")).toBeGreaterThan(client.indexOf('step === "payment"'));
  });

  it("drops the flight card and keeps extras as tiles", () => {
    expect(client).not.toContain("flight-and-pickup-details");
    expect(client).toContain("flight-number");
    expect(client).toContain("who-is-travelling");
    expect(client).toContain("extraOversized");
    expect(client).toContain("vt-checkout__extra");
    expect(client).not.toContain("need-something-unusual-a-bus-a-wedding-an-overni");
    expect(client).toContain("vt-checkout__terms");
  });

  it("does not invent cancel hours and reads jsonb settings", () => {
    expect(layout).toContain("loadSettingsVersion");
    expect(layout).toContain("policyHours");
    expect(layout).not.toMatch(/quote_settings_version\(\)/);
    expect(css).toMatch(/\.vt-checkout \.vt-input--area[\s\S]*border-radius:\s*var\(--vt-radius-lg\)/);
    expect(route).toContain("display:contents");
    expect(route).toContain("grid-row:1");
    expect(route).not.toContain("grid-row:1 / span 2");
  });

  it("drops header phone and book-a-transfer on checkout, shows profile photo and fab", () => {
    expect(header).not.toContain("data-hd-pill");
    expect(header).toContain("isCheckout");
    expect(account).toContain("vamosPhoto");
    expect(shell).toContain("ContactFab");
  });

  it("loads checkout window from settings and does not send place subtitle s", () => {
    const intent = readFileSync(join(WEB_ROOT, "app/api/checkout/intent/route.ts"), "utf8");
    const payLink = readFileSync(join(WEB_ROOT, "app/api/checkout/pay-link/route.ts"), "utf8");
    const home = readFileSync(join(WEB_ROOT, "../../app/home/home.dc.html"), "utf8");
    expect(intent).toContain("policyHours");
    expect(intent).toContain("checkoutWindowMinutes: policy.checkoutWindowMinutes");
    expect(intent).not.toMatch(/checkoutWindowMinutes:\s*30/);
    expect(payLink).toContain("checkoutWindowMinutes: policy.checkoutWindowMinutes");
    expect(payLink).not.toMatch(/checkoutWindowMinutes:\s*30/);
    expect(home).not.toMatch(/s: sub \|\| undefined/);
    expect(home).toContain("text: apiText");
  });

  it("omits null turnstile_token so intent schema does not 400", () => {
    expect(client).toContain("...(turnstile ? { turnstile_token: turnstile } : {})");
    expect(client).not.toMatch(/turnstile_token: turnstile,/);
  });

  it("shows the locked class total, selected class, and no change-vehicle", () => {
    expect(client).toContain("peekLockClassRappen");
    expect(client).toContain("chfRappenToDisplay");
    expect(client).toContain("useVamosLocale");
    expect(client).toContain("shown.major");
    expect(client).not.toContain("PriceSummary total={null}");
    expect(client).toContain("vt-checkout__picked");
    expect(client).not.toContain("change-vehicle");
    expect(css).toContain("padding-block: var(--vt-space-5)");
  });

  it("ports home booking fields onto trip and drops ski plus extra stops", () => {
    expect(client).toContain("vt-checkout__party");
    expect(client).toContain("tCommon(\"passengers\")");
    expect(client).toContain("tQuote(\"flight.placeholder\")");
    expect(client).toContain("couponPlaceholder");
    expect(client).not.toContain("extraSki");
    expect(client).not.toContain("additional-stops");
    expect(client).toContain("turnstile_failed");
    expect(client).toContain("formChallengeFailed");
  });

  it("moves coupon onto the rail and drops Stripe currency selector", () => {
    expect(client).toContain("data-checkout-coupon");
    expect(client).toContain("vt-checkout__sheet");
    expect(client).toContain("vt-checkout__recap");
    expect(client).toContain("vt-checkout__payhead");
    expect(client).toContain("RouteSummary pickup={railPickup} dropoff={railDrop} meta={railMeta}");
    expect(payPanel).not.toContain("CurrencySelectorElement");
    expect(fab).toContain("vt-contact-fab__kicker");
    expect(fab).toContain("t(\"whatsapp\")");
  });

  it("uses branded time spinner, equal date/time fields, and a unified payment page", () => {
    expect(client).toContain("TimePicker");
    expect(client).toContain("vt-checkout__cta");
    expect(client).toContain('refusal !== "pricingNotLive"');
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
    expect(css).toContain('[data-checkout-step="payment"]');
    expect(css).toContain("max-inline-size: 880px");
  });

  it("shows all four classes and dims ones that do not fit pax or bags", () => {
    expect(client).toContain("passengers={draft.passengers}");
    expect(client).toContain("luggage={draft.luggage}");
    expect(client).toContain("classFits");
    expect(client).toContain("firstFittingClass");
    expect(client).toContain("max={7}");
  });
});
