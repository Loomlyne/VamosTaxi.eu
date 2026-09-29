import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { paymentMethodTypeFor } from "./stripe";

function stripeWith(charge: unknown, fail = false): Stripe {
  return {
    paymentIntents: {
      retrieve: vi.fn(async () => {
        if (fail) throw new Error("boom");
        return { latest_charge: charge };
      }),
    },
  } as unknown as Stripe;
}

describe("paymentMethodTypeFor", () => {
  it("reads a plain card", async () => {
    expect(await paymentMethodTypeFor(stripeWith({ payment_method_details: { type: "card", card: {} } }), "pi_1")).toBe("card");
  });
  it("names a wallet card as the wallet", async () => {
    const charge = { payment_method_details: { type: "card", card: { wallet: { type: "apple_pay" } } } };
    expect(await paymentMethodTypeFor(stripeWith(charge), "pi_1")).toBe("apple_pay");
  });
  it("reads TWINT", async () => {
    expect(await paymentMethodTypeFor(stripeWith({ payment_method_details: { type: "twint" } }), "pi_1")).toBe("twint");
  });
  it("returns null for a checkout-session id, a missing charge, or a Stripe error", async () => {
    expect(await paymentMethodTypeFor(stripeWith({ payment_method_details: { type: "card" } }), "cs_1")).toBeNull();
    expect(await paymentMethodTypeFor(stripeWith(null), "pi_1")).toBeNull();
    expect(await paymentMethodTypeFor(stripeWith(null, true), "pi_1")).toBeNull();
  });
});
