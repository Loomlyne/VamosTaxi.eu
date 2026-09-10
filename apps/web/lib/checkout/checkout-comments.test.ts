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

  it("uses block tabs for guest on details and keeps pay-link on payment", () => {
    expect(client).toContain("continue-as-guest");
    expect(client).not.toContain("billingIndividual");
    expect(client).toContain("businessDetails");
    expect(client).toContain("sendPayLink");
    expect(client).toContain("pay-and-continue");
    expect(client).toContain("block");
    expect(client).not.toContain("payNow");
    expect(client).not.toContain("payLinkTab");
    expect(client).not.toContain("payMethod");
    expect(client).not.toMatch(/name=["']acct["']/);
    expect(client.indexOf("continue-as-guest")).toBeGreaterThan(client.indexOf('step === "details"'));
    expect(client.indexOf("continue-as-guest")).toBeLessThan(client.indexOf("businessDetails"));
  });

  it("drops the flight card and paints extras from the live book", () => {
    expect(client).not.toContain("flight-and-pickup-details");
    expect(client).toContain("FlightField");
    expect(client).toContain("who-is-travelling");
    expect(client).toContain("/api/checkout/extras");
    expect(client).toContain("vt-checkout__extra-price");
    expect(client).toContain("meet_greet");
    expect(client).toContain("vt-checkout__extra");
    expect(client).toContain("setChildSeat(trip.childSeat)");
    expect(client).toContain("useState(false)");
    expect(payPanel).not.toContain("decodeURIComponent(secret)");
    expect(client).not.toContain("decodeURIComponent(secret)");
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
    expect(payLink).toContain("payLinkEmailFromLock");
    const payOpen = readFileSync(join(WEB_ROOT, "app/api/checkout/pay-link/open/route.ts"), "utf8");
    expect(payOpen).toContain("loadOpenPayment");
    expect(payOpen).toContain("client_secret_hex");
    expect(payOpen).toContain("decode(${tokenHex}, 'hex')");
    const payClient = readFileSync(
      join(WEB_ROOT, "app/[locale]/checkout/pay/[token]/PayClient.tsx"),
      "utf8",
    );
    expect(payClient).not.toContain("data-checkout-pay-skeleton");
    expect(payClient).toContain("disabled={paying || busy}");
    expect(payClient).not.toContain("disabled={paying || busy || !cardComplete}");
    expect(payClient).toContain("confirmPayRef");
    expect(payClient).toContain("client_secret_hex");
    expect(home).not.toMatch(/s: sub \|\| undefined/);
    expect(home).toContain("text: apiText");
    expect(home).toContain("flight: s.flight || ''");
    expect(home).toContain("flightNumber: s.flight || ''");
  });

  it("omits the checkout Turnstile widget and does not send a token", () => {
    expect(client).not.toContain("TurnstileWidget");
    expect(client).not.toContain("turnstile_token");
    const intent = readFileSync(join(WEB_ROOT, "app/api/checkout/intent/route.ts"), "utf8");
    expect(intent).not.toContain("verifyTurnstile");
    expect(client).not.toContain("turnstile_failed");
    expect(client).not.toContain("formChallengeFailed");
    expect(client.indexOf("vt-checkout__company")).toBeGreaterThan(client.indexOf("vt-checkout__recap"));
    expect(client.indexOf("vt-checkout__recap")).toBeLessThan(client.indexOf("vt-checkout__payhead"));
    expect(css).toContain("min-block-size: var(--vt-control-h-md)");
  });

  it("does not mount PaymentElement until Checkout init finishes", () => {
    expect(payPanel).toContain("function CheckoutWallets");
    expect(payPanel).toContain('state?.type !== "success"');
    expect(payPanel).toContain('if (checkout.type !== "success")');
    expect(payPanel).toContain("payWithApplePay");
    expect(payPanel).toContain("payWithCard");
    expect(payPanel).toContain("vt-checkout__cardblock");
    expect(payPanel).toContain("CardNumberElement");
    expect(payPanel).toContain("CardExpiryElement");
    expect(payPanel).toContain("CardCvcElement");
    expect(payPanel).not.toContain("<PaymentElement");
    expect(payPanel).not.toContain("ConfirmBinder");
    expect(client).toContain("confirmPayRef");
    expect(client).toContain('?? "payCouldNotStart"');
    expect(client).toContain("onComplete={onPaymentComplete}");
    expect(payPanel).toContain("onComplete(numberOk && expiryOk && cvcOk)");
    expect(client).not.toContain('payMethod === "link"');
    expect(client).not.toContain("busy && !clientSecret");
    expect(client).toContain("clientSecret ?? \"\"");
    expect(client).not.toContain("CheckoutPaySkeleton");
    expect(payPanel).not.toContain("CheckoutPaySkeleton");
    expect(client).toContain("disabled={busy}");
    expect(client).not.toContain("disabled={busy || !cardComplete}");
    expect(client).not.toContain("disabled={busy || !cardComplete || !confirmPay}");
    expect(client).toContain("aria-busy={busy || undefined}");
    expect(client).not.toContain('refusal !== "payCouldNotStart"');
    expect(client).not.toContain("companyReady");
    expect(client).toContain("disabled={busy || !isCheckoutEmail(payerEmail)}");
    expect(client).toContain("couponAlreadyOn");
    expect(client).toContain("billingKindFromFields");
    expect(client).toContain("isCheckoutEmail(payerEmail)");
    expect(client.indexOf("vt-checkout__company")).toBeGreaterThan(client.indexOf("vt-checkout__recap"));
    expect(client.indexOf("vt-checkout__company")).toBeLessThan(client.indexOf("vt-checkout__payhead"));
    expect(client).toContain("applyCouponCode");
    expect(client).toContain("peekLockDistanceM");
    expect(client).toContain("data-checkout-distance");
    expect(css).toContain("[data-checkout-total] .vt-price__total");
    expect(css).toContain(".vt-checkout .vt-route__meta");
    expect(css).toContain(".vt-checkout__coupon .vt-btn");
    expect(css).toContain("block-size: var(--vt-control-h-md)");
    expect(css).toMatch(
      /\.vt-checkout__company[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(css).toContain("padding-block-end: 20px");
    expect(css).toContain(".vt-checkout__company-title");
    expect(css).toContain(".vt-checkout__cardfields");
    expect(client).toContain("vatIncl");
    expect(client).toContain("vatOnTopRappen");
    expect(client).toContain("payableWithVatRappen");
    expect(client).toContain("data-checkout-vat-amount");
    expect(client).not.toContain("vatNote");
    expect(client).toContain("fareRappen");
    expect(client).toContain("netRappen");
    expect(client).toContain("wasRappen");
    expect(client).toContain("priceWas");
    expect(client).toContain("client_secret_hex");
    expect(client).toContain("clientSecretHex");
    expect(client).toContain("applyCouponCode(couponApplied, { childSeat: next, oversized, extraStop })");
    expect(payPanel).toContain("ExpressCheckoutElement");
    expect(payPanel).toContain("VAMOS_STRIPE_APPEARANCE");
    expect(payPanel).toContain("data-checkout-express");
    expect(payPanel).toContain("data-checkout-card-fields");
    expect(payPanel).not.toContain("ACCT-000028");
    expect(payPanel).toContain("1234 1234 1234 1234");
    expect(payPanel).toContain('t("cardCountry")');
    expect(payPanel.indexOf('t("cardNumber")')).toBeLessThan(payPanel.indexOf('t("cardCountry")'));
    expect(payPanel.indexOf('t("cardCountry")')).toBeLessThan(payPanel.indexOf('t("cardExpiry")'));
    expect(payPanel.indexOf('t("cardExpiry")')).toBeLessThan(payPanel.indexOf('t("cardCvc")'));
    expect(payPanel).toContain('applePay: "always"');
    expect(payPanel).toContain('link: "auto"');
    expect(payPanel).toContain('googlePay: "never"');
    expect(payPanel).toContain('overflow: "auto"');
    expect(payPanel).toContain('"link", "apple_pay"');
    expect(payPanel).toContain("disableLink: false");
    expect(payPanel).not.toContain("billingAddress:");
    expect(payPanel).toContain("updateBillingAddress");
    expect(payPanel).not.toContain("vt-checkout__link-layer");
    expect(payPanel).not.toContain("vt-checkout__link-open");
    expect(payPanel).toContain("availablePaymentMethods");
    expect(payPanel).toContain("hidden={!hasWallets}");
    expect(payPanel.indexOf('t("cardNumber")')).toBeLessThan(payPanel.indexOf('t("cardCountry")'));
    expect(payPanel.indexOf('t("cardCountry")')).toBeLessThan(payPanel.indexOf('t("cardExpiry")'));
    expect(payPanel.indexOf('t("cardExpiry")')).toBeLessThan(payPanel.indexOf('t("cardCvc")'));
    expect(css).toMatch(
      /\.vt-checkout__cardfields[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(css).toContain("[data-checkout-express][hidden]");
    expect(payPanel).toContain("expressCheckoutConfirmEvent");
    expect(payPanel).toContain("vt-checkout__card-country");
    expect(payPanel).toContain("address: { country }");
    expect(payPanel).not.toContain("vt-checkout__wallettabs");
    expect(css).toContain(".vt-checkout__card-country");
    expect(client).toContain("recapExtras");
    expect(client).toContain("recapExtraFares");
    expect(client).toContain("extraRappenOutsideLock");
    expect(client).toContain("data-checkout-recap-extra");
    expect(client).toContain("`+ ${t(row.labelKey)}`");
    expect(client).toContain("setCouponField(couponFieldFromEval(json.coupon, true))");
    expect(client).not.toContain('setRefusal("couponNoLongerValid")');
    expect(client).toContain("data-checkout-coupon-used");
    expect(client).toContain("couponUsed");
    expect(client).toContain("couponPercentOff");
    expect(client).toContain("couponFixedOff");
    expect(client).toContain("couponRuleFromEval");
    expect(client).toContain("data-checkout-coupon-kind");
    expect(client).toContain("data-coupon-state");
    expect(client).toContain("tCommon(\"remove\")");
    expect(client).toContain("readOnly={Boolean(couponApplied)}");
    expect(client).not.toContain("<Tag");
    expect(css).toContain('[data-coupon-state="valid"]');
    expect(css).toContain('[data-coupon-state="invalid"]');
    expect(payPanel).not.toContain("defaultValues:");
    expect(payPanel).not.toContain("phoneNumber:");
    expect(route).toContain("display:flex;flex-wrap:wrap");
    expect(route).not.toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
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

  it("ports home booking fields onto trip and paints extras from the live book", () => {
    expect(client).toContain("vt-checkout__party");
    expect(client).toContain("tCommon(\"passengers\")");
    expect(client).toContain("FlightField");
    expect(client).toContain("couponPlaceholder");
    expect(client).toContain("/api/checkout/extras");
    expect(client).not.toContain("additional-stops");
    expect(client).toContain("payCouldNotStart");
    expect(client).toContain('setRefusal("completeCard")');
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
    expect(css).toContain("vt-checkout__cta");
    expect(css).toMatch(/\.vt-checkout__payfoot[\s\S]*gap:\s*16px/);
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

  it("fills signed-in details and keeps coupon copy on the coupon field", () => {
    expect(client).toContain("/api/auth/session");
    expect(client).toContain('t("myDetails")');
    expect(client).toContain('t("bookForSomeoneElse")');
    expect(client).toContain('data-checkout-who="signed"');
    expect(client).toContain("if (!guest && !signedIn)");
    expect(client).toContain("data-checkout-coupon-msg");
    expect(client).toContain("couponNotFound");
    expect(client).toContain("couponAppliedOk");
    expect(client).toContain('refusal !== "couponNoLongerValid"');
    expect(client).not.toContain('setRefusal("couponNoLongerValid")');
  });

  it("keeps extras on payment recap after coupon and groups the coupon field", () => {
    expect(client.indexOf("setChildSeat(false)")).toBeLessThan(client.indexOf("setChildSeat(trip.childSeat)"));
    expect(client).toContain("childSeat: seats");
    expect(client).toContain("pinned?.child_seats === 1");
    expect(client).toContain("recapExtraFares");
    expect(client).toContain("data-checkout-recap-extra");
    expect(css).toContain("display: contents");
    expect(css).toContain("white-space: nowrap");
    expect(css).not.toContain(
      "margin-block-start: calc((var(--vt-label-md) * var(--vt-body-leading)) + 6px)",
    );
    expect(client).toContain("toUpperCase()");
    expect(client).toContain('autoCapitalize="characters"');
    expect(css).toContain("text-transform: uppercase");
    expect(css).toContain(".vt-checkout__coupon .vt-input input");
    expect(css).toContain("grid-row: 2");
  });
});
