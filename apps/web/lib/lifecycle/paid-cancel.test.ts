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
let resolvePaymentIntentIdOverride: ((stripe: unknown, storedId: string) => Promise<string | null>) | null = null;

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    createRefund: (...args: unknown[]) => createRefund(...args),
    retrieveRefund: (...args: unknown[]) => retrieveRefund(...args),
    stripeFromEnv: (...args: unknown[]) => stripeFromEnv(...args),
    resolvePaymentIntentId: (stripe: unknown, storedId: string) =>
      resolvePaymentIntentIdOverride
        ? resolvePaymentIntentIdOverride(stripe, storedId)
        : actual.resolvePaymentIntentId(stripe as never, storedId),
  };
});

vi.mock("../db/identity", () => ({
  asSystem: (...args: unknown[]) => asSystem(...args),
  asGuest: (...args: unknown[]) => asGuest(...args),
  asCustomer: vi.fn(),
}));

const notifyCancellation = vi.fn();
const loadPaidCancelMail = vi.fn();
const asGuest = vi.fn();

vi.mock("./notify-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notify-lifecycle")>();
  return { ...actual, notifyCancellation: (...args: unknown[]) => notifyCancellation(...args) };
});

vi.mock("../db/system-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/system-reads")>();
  return { ...actual, loadPaidCancelMail: (...args: unknown[]) => loadPaidCancelMail(...args) };
});

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

  it("finishPaidCancel has no Stripe call and no customer-cancel idempotency key (20-10)", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    const start = src.indexOf("export async function finishPaidCancel");
    const end = src.indexOf("export async function paidCancelGuest");
    const body = src.slice(start, end);
    expect(body).not.toMatch(/createRefund|applyStripeRefund|stripeFromEnv|customer-cancel/);
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

  it("resolves the PaymentIntent id before calling createRefund, never a stale cs_ id (D-05)", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    const resolveAt = src.indexOf("resolvePaymentIntentId(");
    const createAt = src.indexOf("createRefund(");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(createAt);
  });
});

describe("unpaid cancel route stays D-09", () => {
  it("does not call createRefund", () => {
    // 26.1-06 moved the RPC call into lib/checkout/cancel-unpaid.ts; check both files.
    const uncomment = (src: string) =>
      src
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
    const route = uncomment(read("apps/web/app/api/account/bookings/cancel/route.ts"));
    const lib = uncomment(read("apps/web/lib/checkout/cancel-unpaid.ts"));
    expect(route).toMatch(/cancelUnpaidForCustomer/);
    expect(lib).toMatch(/checkout_cancel_unpaid/);
    for (const src of [route, lib]) {
      expect(src).not.toMatch(/createRefund/);
      expect(src).not.toMatch(/paid-cancel/);
    }
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
    resolvePaymentIntentIdOverride = null;
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
      bookingId: BOOKING_ID,
      paymentId: PAYMENT_ID,
      reason: "customer_cancel",
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

  it("a null PaymentIntent resolution never calls createRefund, marks refund failed, returns stripe-failed (D-05)", async () => {
    resolvePaymentIntentIdOverride = async () => null;
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
      paymentIntentId: "cs_test_stale",
      amountRappen: 8000,
      idempotencyKey: `refund:${BOOKING_ID}:${PAYMENT_ID}:customer-cancel`,
    });

    expect(result).toEqual({ ok: false, code: "stripe-failed" });
    expect(createRefund).not.toHaveBeenCalled();
    expect(failedSql).toMatch(/bookings_set_refund_failed/);
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
  it("notifies cancellation after success (refunds are by hand, 20-10: no refund-failed mail here)", () => {
    const src = read("apps/web/lib/lifecycle/paid-cancel.ts");
    expect(src).toMatch(/notifyCancellation|sendCancellation/);
    expect(src).not.toMatch(/notifyRefundFailed/);
    expect(src).toMatch(/assigned_chauffeur_id/);
    expect(src).not.toMatch(/info@/);
    expect(src).not.toMatch(/\bTRIP\b/);
    expect(src).not.toMatch(/LX1234/);
    const notify = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    expect(notify).toContain("BOOKINGS_OPS_EMAIL");
    expect(notify).toContain("urgent: assigned");
  });
});

// 20-10: refunds by hand. A cancel more than 24 h ahead calls no Stripe refund; the booking shows
// "Refund due" and the admin sends it. Synthetic rappen only.
describe("paid cancel, refunds by hand (20-10)", () => {
  const MAIL_ROW = {
    reference: "VT-26-0101",
    locale: "en",
    contact_email: "guest@example.test",
    pickup_text: "A",
    dropoff_text: "B",
    scheduled_local: "2026-10-20 10:00",
    assigned_chauffeur_id: null,
    chauffeur_email: null,
  };

  function guestReturns(row: Record<string, unknown>) {
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hash: string, fn: (sql: unknown) => unknown) => {
      const sql = async () => [row];
      return fn(sql);
    });
  }

  beforeEach(() => {
    for (const m of [createRefund, retrieveRefund, stripeFromEnv, asSystem, asGuest, notifyCancellation, loadPaidCancelMail]) {
      m.mockReset();
    }
    loadPaidCancelMail.mockResolvedValue(MAIL_ROW);
    stripeFromEnv.mockReturnValue({});
  });

  it("more than 24 h ahead: zero Stripe refund calls, answers refund due with the owed amount", async () => {
    guestReturns({ booking_id: BOOKING_ID, refund_mode: "auto_full", refund_rappen: 10000, stripe_payment_intent_id: PI });
    const { paidCancelGuest } = await import("./paid-cancel");
    const result = await paidCancelGuest(ENV, "ab".repeat(32));
    expect(result).toEqual({
      ok: true,
      bookingId: BOOKING_ID,
      refundMode: "auto_full",
      refundStatus: "pending_ops",
      refundRappen: 10000,
    });
    expect(createRefund).not.toHaveBeenCalled();
    expect(retrieveRefund).not.toHaveBeenCalled();
    expect(stripeFromEnv).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
    expect(notifyCancellation).toHaveBeenCalledTimes(1);
    expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({ refundLine: "full_captured" });
  });

  it("the same with a live key: still ok, still zero Stripe calls", async () => {
    guestReturns({ booking_id: BOOKING_ID, refund_mode: "auto_full", refund_rappen: 10000, stripe_payment_intent_id: PI });
    const { paidCancelGuest } = await import("./paid-cancel");
    const result = await paidCancelGuest({ STRIPE_SECRET_KEY: "sk_live_x" } as CloudflareEnv, "ab".repeat(32));
    expect(result).toMatchObject({ ok: true, refundStatus: "pending_ops", refundRappen: 10000 });
    expect(createRefund).not.toHaveBeenCalled();
    expect(stripeFromEnv).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("inside 24 h: pending_ops, the team decides, mail line pending_ops", async () => {
    guestReturns({ booking_id: BOOKING_ID, refund_mode: "pending_ops", refund_rappen: null, stripe_payment_intent_id: PI });
    const { paidCancelGuest } = await import("./paid-cancel");
    const result = await paidCancelGuest(ENV, "ab".repeat(32));
    expect(result).toMatchObject({ ok: true, refundMode: "pending_ops", refundStatus: "pending_ops", refundRappen: 0 });
    expect(createRefund).not.toHaveBeenCalled();
    expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({ refundLine: "pending_ops" });
  });

  it("auto_full with nothing captured is none, mail line none", async () => {
    guestReturns({ booking_id: BOOKING_ID, refund_mode: "auto_full", refund_rappen: 0, stripe_payment_intent_id: null });
    const { paidCancelGuest } = await import("./paid-cancel");
    const result = await paidCancelGuest(ENV, "ab".repeat(32));
    expect(result).toMatchObject({ ok: true, refundStatus: "none", refundRappen: 0 });
    expect(createRefund).not.toHaveBeenCalled();
    expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({ refundLine: "none" });
  });
});
