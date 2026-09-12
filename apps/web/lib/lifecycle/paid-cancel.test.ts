// apps/web/lib/lifecycle/paid-cancel.test.ts
//
// 09-01 Wave 0 + 09-05: guest paid-cancel → createRefund THEN record_booking_refund (D-08).
// Mock Stripe only. Never sk_live_ calls. Synthetic rappen only. No invented CHF. No TRIP. No LX1234.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const createRefund = vi.fn();
const retrieveRefund = vi.fn();
const stripeFromEnv = vi.fn();
const asSystem = vi.fn();

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    createRefund: (...args: unknown[]) => createRefund(...args),
    retrieveRefund: (...args: unknown[]) => retrieveRefund(...args),
    stripeFromEnv: (...args: unknown[]) => stripeFromEnv(...args),
  };
});

vi.mock("../db/identity", () => ({
  asSystem: (...args: unknown[]) => asSystem(...args),
  asGuest: vi.fn(),
  asCustomer: vi.fn(),
}));

const BOOKING_ID = "00000000-0000-4000-8000-000000000009";
const PAYMENT_ID = 41;
const PI = "pi_test_cancel_1";
const ENV = { STRIPE_SECRET_KEY: "sk_test_paid_cancel" } as CloudflareEnv;

describe("createRefund contract", () => {
  it("takes paymentIntentId, amountRappen, and idempotencyKey", () => {
    const src = read("apps/web/lib/checkout/stripe.ts");
    const start = src.indexOf("export async function createRefund");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 700);
    expect(body).toMatch(/paymentIntentId/);
    expect(body).toMatch(/amountRappen/);
    expect(body).toMatch(/idempotencyKey/);
    expect(body).toMatch(/stripe\.refunds\.create/);
  });
});

describe("paid-cancel Stripe-before-record (D-08)", () => {
  it("calls createRefund then record_booking_refund, never the reverse", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    const createAt = src.indexOf("createRefund");
    const recordAt = src.indexOf("record_booking_refund");
    expect(createAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(recordAt);
  });

  it("Stripe fail leaves cancelled + refund_status failed; no un-cancel (D-08)", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/bookings_set_refund_failed/);
    expect(src).toMatch(/cancelled/);
    expect(src).toMatch(/failed/);
    expect(src).not.toMatch(/un-cancel/);
    expect(src).not.toMatch(/status:\s*['"]paid['"]/);
    expect(src).not.toMatch(/status:\s*['"]confirmed['"]/);
  });

  it("idempotency key includes booking id and payment id", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/idempotencyKey/);
    expect(src).toMatch(/bookingId|booking_id|booking id/i);
    expect(src).toMatch(/paymentId|payment_id|payment id/i);
    expect(src).toMatch(/refund:\{bookingId\}:\{paymentId\}:customer-cancel|bookingId.*paymentId/);
  });

  it("retrieves Stripe refund country or available_on (D-07) and never invents day counts", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/retrieveRefund|refunds\.retrieve/);
    expect(src).toMatch(/payment_method_details|card\.country|payoutCountry|payout_country/);
    expect(src).toMatch(/available_on|availableOn/);
    expect(src).not.toMatch(/3–5 business days|3-5 business days|business days/);
  });

  it("skips Stripe for pending_ops and none", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/pending_ops/);
    expect(src).toMatch(/auto_full/);
    expect(src).toMatch(/sk_live_/);
  });
});

describe("unpaid cancel route stays D-09", () => {
  it("does not call createRefund", () => {
    const src = read("apps/web/app/api/account/bookings/cancel/route.ts");
    const uncommented = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(uncommented).toMatch(/checkout_cancel_unpaid/);
    expect(uncommented).not.toMatch(/createRefund/);
    expect(uncommented).not.toMatch(/paid-cancel/);
  });
});

describe("guest and signed-in paid-cancel routes", () => {
  it("guest hashes token, never looks up by reference, 404 has no TRIP", () => {
    const src = read("apps/web/app/api/manage/cancel/route.ts");
    expect(src).toMatch(/hashManageToken/);
    expect(src).toMatch(/force-dynamic/);
    expect(src).toMatch(/paidCancelGuest|asGuest/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
    expect(src).not.toMatch(/checkout_cancel_unpaid/);
    expect(src).not.toMatch(/from public\.bookings/);
  });

  it("signed-in paid-cancel uses JWT and does not replace unpaid cancel", () => {
    const src = read("apps/web/app/api/account/bookings/paid-cancel/route.ts");
    expect(src).toMatch(/customerClaims/);
    expect(src).toMatch(/paidCancelCustomer/);
    expect(src).toMatch(/force-dynamic/);
    expect(src).not.toMatch(/checkout_cancel_unpaid/);
    expect(src).not.toMatch(/\bTRIP\b/);
  });
});

describe("payoutFactsFromRefund (D-07)", () => {
  it("uses card country when Stripe provides it, else CH", async () => {
    const { payoutFactsFromRefund } = await import("./paid-cancel");
    expect(
      payoutFactsFromRefund({
        charge: { payment_method_details: { card: { country: "de" } } },
        balance_transaction: { available_on: 1_789_250_000 },
      }),
    ).toEqual({
      payoutCountry: "DE",
      availableOn: new Date(1_789_250_000 * 1000).toISOString(),
    });
    expect(payoutFactsFromRefund({})).toEqual({ payoutCountry: "CH", availableOn: null });
  });
});

describe("applyStripeRefund mocked order", () => {
  beforeEach(() => {
    createRefund.mockReset();
    retrieveRefund.mockReset();
    stripeFromEnv.mockReset();
    asSystem.mockReset();
    stripeFromEnv.mockReturnValue({});
  });

  it("createRefund then retrieve then record_booking_refund", async () => {
    const order: string[] = [];
    createRefund.mockImplementation(async () => {
      order.push("createRefund");
      return { id: "re_test_1", currency: "chf", amount: 8000 };
    });
    retrieveRefund.mockImplementation(async () => {
      order.push("retrieve");
      return {
        id: "re_test_1",
        currency: "chf",
        charge: { payment_method_details: { card: { country: "FR" } } },
        balance_transaction: { available_on: 1_789_250_000 },
      };
    });
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const text = strings.join(" ");
        if (text.includes("record_booking_refund")) order.push("record");
        if (text.includes("bookings_set_refund_failed")) order.push("failed");
        return [{ booking_id: BOOKING_ID, refund_id: 9 }];
      };
      return fn(sql);
    });

    const { applyStripeRefund } = await import("./paid-cancel");
    const result = await applyStripeRefund(ENV, {
      bookingId: BOOKING_ID,
      paymentId: PAYMENT_ID,
      paymentIntentId: PI,
      amountRappen: 8000,
      idempotencyKey: `refund:${BOOKING_ID}:${PAYMENT_ID}:customer-cancel`,
    });

    expect(createRefund).toHaveBeenCalledWith(expect.anything(), {
      paymentIntentId: PI,
      amountRappen: 8000,
      idempotencyKey: `refund:${BOOKING_ID}:${PAYMENT_ID}:customer-cancel`,
    });
    expect(order).toEqual(["createRefund", "retrieve", "record"]);
    expect(result).toMatchObject({
      ok: true,
      payoutCountry: "FR",
      availableOn: new Date(1_789_250_000 * 1000).toISOString(),
    });
  });

  it("Stripe throw calls bookings_set_refund_failed and does not un-cancel", async () => {
    createRefund.mockRejectedValue(new Error("card_decline"));
    let failedSql = "";
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
        failedSql = strings.join(" ");
        return [];
      };
      return fn(sql);
    });

    const { applyStripeRefund } = await import("./paid-cancel");
    const result = await applyStripeRefund(ENV, {
      bookingId: BOOKING_ID,
      paymentId: PAYMENT_ID,
      paymentIntentId: PI,
      amountRappen: 8000,
      idempotencyKey: `refund:${BOOKING_ID}:${PAYMENT_ID}:customer-cancel`,
    });

    expect(result).toEqual({ ok: false, code: "stripe-failed" });
    expect(failedSql).toMatch(/bookings_set_refund_failed/);
    expect(failedSql).not.toMatch(/status/);
    expect(retrieveRefund).not.toHaveBeenCalled();
  });

  it("refuses sk_live_", async () => {
    const { applyStripeRefund } = await import("./paid-cancel");
    const result = await applyStripeRefund(
      { STRIPE_SECRET_KEY: "sk_live_nope" } as CloudflareEnv,
      {
        bookingId: BOOKING_ID,
        paymentId: PAYMENT_ID,
        paymentIntentId: PI,
        amountRappen: 8000,
        idempotencyKey: `refund:${BOOKING_ID}:${PAYMENT_ID}:customer-cancel`,
      },
    );
    expect(result).toEqual({ ok: false, code: "stripe-test-only" });
    expect(createRefund).not.toHaveBeenCalled();
  });
});

describe("paid-cancel lifecycle mails (D-11/D-14)", () => {
  it("notifies cancellation after success and refund-failed to ops", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/notifyCancellation|sendCancellation/);
    expect(src).toMatch(/notifyRefundFailed|sendRefundFailed/);
    expect(src).toMatch(/assigned_chauffeur_id/);
    expect(src).not.toMatch(/info@/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
    const notify = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    expect(notify).toContain("BOOKINGS_OPS_EMAIL");
    expect(notify).toContain("urgent: assigned");
  });
});
