import { describe, expect, it } from "vitest";
import { checkoutPageLocale, checkoutReturnUrl, checkoutSessionIdFromSecret, checkoutSettleUrl, stripeCheckoutReturnUrl } from "./return-url";

describe("checkout return url", () => {
  it("reads the Checkout Session id out of the client secret", () => {
    expect(checkoutSessionIdFromSecret("cs_test_a1ly_secret_abc")).toBe("cs_test_a1ly");
    expect(checkoutSessionIdFromSecret("not-a-secret")).toBe("");
  });

  it("sends a paid confirm to the settle route, not back to the payment page", () => {
    expect(checkoutReturnUrl("https://vamostaxi.site", "VT-26-0730", "cs_test_a1ly", "en")).toBe(
      "https://vamostaxi.site/api/checkout/return?ref=VT-26-0730&session=cs_test_a1ly&locale=en",
    );
  });

  it("reads the locale from the path, not from a payment-page return", () => {
    expect(checkoutPageLocale("/checkout/payment")).toBe("en");
    expect(checkoutPageLocale("/de/checkout/payment")).toBe("de");
  });

  it("builds a settle URL without a reference so a wallet return can look the booking up", () => {
    expect(checkoutSettleUrl("https://vamostaxi.site", "cs_test_a1ly", "en")).toBe(
      "https://vamostaxi.site/api/checkout/return?session=cs_test_a1ly&locale=en",
    );
  });

  it("gives Stripe a return URL with the session template, not the payment page", () => {
    expect(stripeCheckoutReturnUrl("https://vamostaxi.site", "de")).toBe(
      "https://vamostaxi.site/api/checkout/return?locale=de&session_id={CHECKOUT_SESSION_ID}",
    );
  });
});
