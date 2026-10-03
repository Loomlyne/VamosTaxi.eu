import { describe, expect, it } from "vitest";
import { checkoutPageLocale, checkoutSessionIdFromSecret, stripeCheckoutReturnUrl } from "./return-url";

describe("checkout return url", () => {
  it("reads the Checkout Session id out of the client secret", () => {
    expect(checkoutSessionIdFromSecret("cs_test_a1ly_secret_abc")).toBe("cs_test_a1ly");
    expect(checkoutSessionIdFromSecret("not-a-secret")).toBe("");
  });

  it("reads the locale from the path, not from a payment-page return", () => {
    expect(checkoutPageLocale("/checkout/payment")).toBe("en");
    expect(checkoutPageLocale("/de/checkout/payment")).toBe("de");
  });

  it("gives Stripe a return URL with the session template, not the payment page", () => {
    expect(stripeCheckoutReturnUrl("https://vamostaxi.site", "de")).toBe(
      "https://vamostaxi.site/api/checkout/return?locale=de&session_id={CHECKOUT_SESSION_ID}",
    );
  });
});
