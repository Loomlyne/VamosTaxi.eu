import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
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
    expect(client).not.toMatch(/label=\{tBooking\(\"date\"\)\}/);
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
});
