import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  CHECKOUT_UI_MODE,
  createCheckoutSession,
  createRefund,
  expireCheckoutSession,
  missingEnvError,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
  stripeSessionExpiresAtUnix,
} from "./stripe";
import { CHARGE_CURRENCY } from "./currency";

function fakeStripe() {
  const create = vi.fn();
  const expire = vi.fn();
  const retrieve = vi.fn();
  const refundCreate = vi.fn();
  create.mockResolvedValue({ id: "cs_test_1" });
  expire.mockResolvedValue({ id: "cs_test_1", status: "expired" });
  retrieve.mockResolvedValue({ id: "cs_test_1" });
  refundCreate.mockResolvedValue({ id: "re_test_1" });
  return {
    create,
    expire,
    retrieve,
    refundCreate,
    client: {
      checkout: { sessions: { create, expire, retrieve } },
      refunds: { create: refundCreate },
    } as unknown as Stripe,
  };
}

describe("stripe module", () => {
  it("uses elements ui_mode (Dahlia rename of custom)", () => {
    expect(CHECKOUT_UI_MODE).toBe("elements");
  });

  it("throws when STRIPE_SECRET_KEY is missing", () => {
    expect(() => stripeFromEnv({} as CloudflareEnv)).toThrow(missingEnvError("STRIPE_SECRET_KEY"));
  });

  it("throws when STRIPE_PUBLISHABLE_KEY is missing", () => {
    expect(() => stripePublishableKey({} as CloudflareEnv)).toThrow(
      missingEnvError("STRIPE_PUBLISHABLE_KEY"),
    );
  });

  it("creates a Checkout Session charged in chf with Adaptive Pricing", async () => {
    const { client, create } = fakeStripe();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await createCheckoutSession(client, {
      chargedRappen: 8000,
      bookingId: "00000000-0000-4000-8000-000000000001",
      bookingReference: "VT-26-0001",
      customerEmail: "guest@example.test",
      locale: "de",
      idempotencyKey: "idem-1",
      expiresAt,
      returnUrl: "https://vamostaxi.site/en/confirmation/VT-26-0001",
      productName: "Airport transfer",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0] as Record<string, unknown>;
    const opts = create.mock.calls[0]?.[1] as Record<string, unknown>;
    const lineItems = params.line_items as Array<{
      price_data: { currency: string; unit_amount: number };
    }>;
    expect(params.mode).toBe("payment");
    expect(params.ui_mode).toBe("elements");
    expect(params.adaptive_pricing).toEqual({ enabled: true });
    expect(params.expand).toEqual(["payment_intent"]);
    expect(lineItems[0]?.price_data.currency).toBe(CHARGE_CURRENCY);
    expect(lineItems[0]?.price_data.unit_amount).toBe(8000);
    expect(params.locale).toBe("de");
    expect(params.expires_at).toBe(stripeSessionExpiresAtUnix(expiresAt));
    expect(opts).toEqual({ idempotencyKey: "idem-1" });
    expect(params).not.toHaveProperty("payment_method_types");
    expect(JSON.stringify(params)).not.toMatch(/accepts_/);
  });

  it("expires a Checkout Session rather than cancelling a PaymentIntent", async () => {
    const { client, expire } = fakeStripe();
    await expireCheckoutSession(client, "cs_test_1");
    expect(expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("retrieves a session expanded to the PaymentIntent", async () => {
    const { client, retrieve } = fakeStripe();
    await retrieveCheckoutSession(client, "cs_test_1");
    expect(retrieve).toHaveBeenCalledWith("cs_test_1", {
      expand: ["payment_intent"],
    });
  });

  it("refunds by payment_intent id, never a Charge id", async () => {
    const { client, refundCreate } = fakeStripe();
    await createRefund(client, {
      paymentIntentId: "pi_test_1",
      amountRappen: 8000,
      idempotencyKey: "refund-1",
    });
    const params = refundCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    const opts = refundCreate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params).toEqual({
      payment_intent: "pi_test_1",
      amount: 8000,
      reason: "requested_by_customer",
    });
    expect(params).not.toHaveProperty("charge");
    expect(opts).toEqual({ idempotencyKey: "refund-1" });
  });

  it("clamps Stripe session expiry to 30 minutes–24 hours", () => {
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    expect(stripeSessionExpiresAtUnix(new Date(now + 1440 * 60_000), now)).toBe(
      Math.floor(now / 1000) + 24 * 60 * 60 - 30,
    );
    expect(stripeSessionExpiresAtUnix(new Date(now + 10 * 60_000), now)).toBe(
      Math.floor(now / 1000) + 30 * 60,
    );
    expect(stripeSessionExpiresAtUnix(new Date(now + 60 * 60_000), now)).toBe(
      Math.floor(now / 1000) + 60 * 60,
    );
  });
});
