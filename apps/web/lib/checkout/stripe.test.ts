import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  CHECKOUT_UI_MODE,
  createCheckoutSession,
  createRefund,
  expireCheckoutSession,
  missingEnvError,
  resolvePaymentIntentId,
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
    const excluded = (params.excluded_payment_method_types ?? []) as string[];
    expect(excluded).not.toContain("paypal");
    expect(excluded).not.toContain("amazon_pay");
    expect(excluded).not.toContain("twint");
    expect(excluded).not.toContain("card");
    expect(excluded).not.toContain("link");
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

  it("refunds by payment_intent id, never a Charge id, and always carries app-refund metadata (D-05)", async () => {
    const { client, refundCreate } = fakeStripe();
    await createRefund(client, {
      paymentIntentId: "pi_test_1",
      amountRappen: 8000,
      idempotencyKey: "refund-1",
      bookingId: "00000000-0000-4000-8000-000000000001",
      paymentId: 41,
      reason: "customer_cancel",
    });
    const params = refundCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    const opts = refundCreate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params).toEqual({
      payment_intent: "pi_test_1",
      amount: 8000,
      reason: "requested_by_customer",
      metadata: {
        vamos_source: "app",
        booking_id: "00000000-0000-4000-8000-000000000001",
        payment_id: "41",
        reason: "customer_cancel",
      },
    });
    expect(params).not.toHaveProperty("charge");
    expect(opts).toEqual({ idempotencyKey: "refund-1" });
  });

  describe("resolvePaymentIntentId (D-05/X0b)", () => {
    it("returns a pi_ id as-is, with no Stripe call", async () => {
      const { client, retrieve } = fakeStripe();
      const result = await resolvePaymentIntentId(client, "pi_test_1");
      expect(result).toBe("pi_test_1");
      expect(retrieve).not.toHaveBeenCalled();
    });

    it("resolves a cs_ id by retrieving the session's expanded payment_intent", async () => {
      const { client, retrieve } = fakeStripe();
      retrieve.mockResolvedValue({
        id: "cs_test_a1lyA5",
        payment_intent: { id: "pi_from_session" },
      });
      const result = await resolvePaymentIntentId(client, "cs_test_a1lyA5");
      expect(result).toBe("pi_from_session");
      expect(retrieve).toHaveBeenCalledWith("cs_test_a1lyA5", { expand: ["payment_intent"] });
    });

    it("returns null when a cs_ session has no PaymentIntent yet", async () => {
      const { client, retrieve } = fakeStripe();
      retrieve.mockResolvedValue({ id: "cs_test_1", payment_intent: null });
      expect(await resolvePaymentIntentId(client, "cs_test_1")).toBeNull();
    });

    it("refuses any other prefix — empty, ch_, or garbage — with no Stripe call", async () => {
      const { client, retrieve } = fakeStripe();
      expect(await resolvePaymentIntentId(client, "")).toBeNull();
      expect(await resolvePaymentIntentId(client, "ch_test_1")).toBeNull();
      expect(await resolvePaymentIntentId(client, "garbage")).toBeNull();
      expect(retrieve).not.toHaveBeenCalled();
    });
  });

  it("stamps extra Checkout Session metadata kind extra", async () => {
    const { client, create } = fakeStripe();
    await createCheckoutSession(client, {
      chargedRappen: 4000,
      bookingId: "00000000-0000-4000-8000-000000000001",
      bookingReference: "VT-26-0001",
      customerEmail: "guest@example.test",
      locale: "en",
      idempotencyKey: "extra-1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      returnUrl: "https://vamostaxi.site/en/confirmation/VT-26-0001",
      productName: "Fare difference",
      extra: { extraId: "extra-9" },
    });
    const params = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.metadata).toEqual({
      booking_id: "00000000-0000-4000-8000-000000000001",
      booking_reference: "VT-26-0001",
      kind: "extra",
      extra_id: "extra-9",
    });
    expect((params.line_items as Array<{ price_data: { unit_amount: number } }>)[0]?.price_data.unit_amount).toBe(4000);
    expect(params.ui_mode).toBe("elements");
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
