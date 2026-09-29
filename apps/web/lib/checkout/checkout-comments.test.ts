import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const placeCombo = readFileSync(join(WEB_ROOT, "components/forms/PlaceCombo.tsx"), "utf8");
const fab = readFileSync(join(WEB_ROOT, "components/shell/ContactFab.tsx"), "utf8");
const css = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/checkout.css"), "utf8");
const layout = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/layout.tsx"), "utf8");
const route = readFileSync(join(WEB_ROOT, "components/transfer/RouteSummary.css"), "utf8");
const header = readFileSync(join(WEB_ROOT, "components/shell/SiteHeader.tsx"), "utf8");
const account = readFileSync(join(WEB_ROOT, "components/shell/SiteHeaderAccount.tsx"), "utf8");
const shell = readFileSync(join(WEB_ROOT, "components/shell/SiteShell.tsx"), "utf8");
const contact = readFileSync(join(WEB_ROOT, "components/booking/ContactFields.tsx"), "utf8");
const home = readFileSync(join(WEB_ROOT, "../../app/home/home.dc.html"), "utf8");

describe("checkout comment pack", () => {
  it("uses the locked-plus phone field and refuses bad email", () => {
    expect(contact).toContain("PhoneField");
    expect(contact).toContain("isCheckoutEmail");
    expect(contact).toContain("CHECKOUT_EMAIL_RE");
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
    const home = readFileSync(join(WEB_ROOT, "../../app/home/home.dc.html"), "utf8");
    expect(intent).toContain("policyHours");
    // 26.3 D-02: the hosted web session lasts 31 minutes; the settings window must still be open.
    expect(intent).toContain("checkoutWindowMinutes: WEB_CHECKOUT_MINUTES");
    expect(intent).not.toMatch(/checkoutWindowMinutes:\s*30/);
    const payOpen = readFileSync(join(WEB_ROOT, "app/api/checkout/pay-link/open/route.ts"), "utf8");
    expect(payOpen).toContain("loadOpenPayment");
    const payClient = readFileSync(
      join(WEB_ROOT, "app/[locale]/checkout/pay/[token]/PayClient.tsx"),
      "utf8",
    );
    expect(payClient).not.toContain("data-checkout-pay-skeleton");
    expect(payClient).toContain("const payDisabled = opening || busy || !ready || payLocked;");
    expect(payClient).toContain("disabled={payDisabled}");
    expect(home).not.toMatch(/s: sub \|\| undefined/);
    expect(home).toContain("text: apiText");
  });

  it("home starts a new booking and never carries extras or contact into checkout", () => {
    expect(home).toContain("function cleanStaleTrip");
    expect(home).toContain("removeItem('vamosTrip')");
    expect(home).toContain("removeItem('vamosQuoteLock')");
    const handoff = home.slice(home.indexOf("location.assign(prefix + '/checkout?'") - 1400, home.indexOf("location.assign(prefix + '/checkout?'"));
    expect(handoff).not.toMatch(/extras|childSeat|skiRack|oversizedLuggage|contact|email|mobile/);
  });

  it("the checkout page files never send a pay link and never write the old browser trip", () => {
    for (const rel of [
      "app/[locale]/checkout/CheckoutPage.tsx",
      "app/[locale]/checkout/sections/ContactSection.tsx",
      "app/[locale]/checkout/sections/PaymentSection.tsx",
      "app/[locale]/checkout/sections/SummaryRail.tsx",
    ]) {
      const src = readFileSync(join(WEB_ROOT, rel), "utf8");
      expect(src).not.toContain("/api/checkout/pay-link");
      expect(src).not.toContain("writeVamosTrip");
    }
  });
});
