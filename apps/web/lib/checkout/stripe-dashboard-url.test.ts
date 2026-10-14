// apps/web/lib/checkout/stripe-dashboard-url.test.ts
//
// Phase 31 (D-06, C-01): the dashboard REFUND link points at one PaymentIntent page on the
// fixed Stripe Dashboard origin. Mode comes from the Worker key, the account id from a plain
// var; neither the account id nor the payment id may bend the URL. Synthetic ids only.

import { describe, expect, it } from "vitest";
import { stripePaymentUrl } from "./stripe-dashboard-url";

const ORIGIN = "https://dashboard.stripe.com/";
const PI = "pi_123abc";
const ACCT = "acct_1AbCdEfGh";

describe("stripePaymentUrl", () => {
  it.each([
    ["live", undefined, "https://dashboard.stripe.com/payments/pi_123abc"],
    ["test", undefined, "https://dashboard.stripe.com/test/payments/pi_123abc"],
    ["live", null, "https://dashboard.stripe.com/payments/pi_123abc"],
    ["live", "", "https://dashboard.stripe.com/payments/pi_123abc"],
    ["live", ACCT, "https://dashboard.stripe.com/acct_1AbCdEfGh/payments/pi_123abc"],
    ["test", ACCT, "https://dashboard.stripe.com/acct_1AbCdEfGh/test/payments/pi_123abc"],
  ] as const)("mode %s, account %s -> %s", (mode, accountId, want) => {
    expect(stripePaymentUrl({ mode, accountId, paymentIntentId: PI })).toBe(want);
  });

  it.each(["acct_x", "acct_1AbCdEfGh/../x", " acct_1AbCdEfGh", "acct_1AbCdEfGh ", "evil.com", "acct_1AbCdEfGh?x=1", "acct_1AbCdEfGh#x"])(
    "drops a malformed account id %j: no account segment",
    (accountId) => {
      expect(stripePaymentUrl({ mode: "live", accountId, paymentIntentId: PI })).toBe(
        "https://dashboard.stripe.com/payments/pi_123abc",
      );
      expect(stripePaymentUrl({ mode: "test", accountId, paymentIntentId: PI })).toBe(
        "https://dashboard.stripe.com/test/payments/pi_123abc",
      );
    },
  );

  it("returns null without a mode", () => {
    expect(stripePaymentUrl({ mode: null, paymentIntentId: PI })).toBeNull();
    expect(stripePaymentUrl({ mode: null, accountId: ACCT, paymentIntentId: PI })).toBeNull();
  });

  it.each(["cs_123", "ch_123", "pi_", "pi_x/../y", "pi_x?y", "pi_x#y", "pi_x y", " pi_123", "", "re_123"])(
    "returns null for a payment id that is not a PaymentIntent id: %j",
    (paymentIntentId) => {
      expect(stripePaymentUrl({ mode: "live", accountId: ACCT, paymentIntentId })).toBeNull();
      expect(stripePaymentUrl({ mode: "test", paymentIntentId })).toBeNull();
    },
  );

  it("every non-null result stays on the fixed origin with no query, fragment or empty segment", () => {
    const accounts = [undefined, null, "", ACCT, "acct_x", "evil.com", "acct_1AbCdEfGh/../x"];
    const ids = [PI, "pi_A_b_9", "cs_123", "pi_x/../y", "pi_x?y"];
    let seen = 0;
    for (const mode of ["live", "test", null] as const) {
      for (const accountId of accounts) {
        for (const paymentIntentId of ids) {
          const url = stripePaymentUrl({ mode, accountId, paymentIntentId });
          if (url === null) continue;
          seen += 1;
          expect(url.startsWith(ORIGIN)).toBe(true);
          const rest = url.slice(ORIGIN.length);
          expect(rest).not.toMatch(/[?#\s]/);
          expect(rest).not.toContain("//");
          expect(rest).not.toContain("..");
          expect(new URL(url).origin).toBe("https://dashboard.stripe.com");
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
