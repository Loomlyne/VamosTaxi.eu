// apps/web/lib/checkout/cancel-unpaid.test.ts
//
// Plan 26.1-06 (D-04): a signed-in customer's account cancel of their own
// unpaid booking also expires every open Stripe Checkout Session for it. A
// Stripe failure never undoes the DB cancel (26.1-02's revive is the belt
// for a payment that still slips through). The legacy UAE test publishable
// key never calls Stripe, same guard as /api/checkout/abandon.

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const stripeFromEnv = vi.fn();
const expireCheckoutSession = vi.fn();

vi.mock("../db/identity", () => ({
  asCustomer: (...args: unknown[]) => asCustomer(...args),
}));

vi.mock("./stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe")>();
  return {
    ...actual,
    stripeFromEnv: (...args: unknown[]) => stripeFromEnv(...args),
    expireCheckoutSession: (...args: unknown[]) => expireCheckoutSession(...args),
  };
});

import { cancelUnpaidForCustomer, cancelUnpaidForCustomerWithDeps } from "./cancel-unpaid";

const CLAIMS = { sub: "cust-1", role: "authenticated" as const, email: "ada@example.test" };

describe("cancelUnpaidForCustomerWithDeps (pure, D-04)", () => {
  it("expires each session id the RPC returns and reports cancelled true", async () => {
    const runCancel = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1", "cs_2"] },
    ]);
    const expireSession = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn();

    const result = await cancelUnpaidForCustomerWithDeps(
      { runCancel, expireSession, canExpire: true, emit },
      "VT-25-00001",
    );

    expect(result).toEqual({ cancelled: true });
    expect(runCancel).toHaveBeenCalledWith("VT-25-00001");
    expect(expireSession).toHaveBeenCalledTimes(2);
    expect(expireSession).toHaveBeenNthCalledWith(1, "cs_1");
    expect(expireSession).toHaveBeenNthCalledWith(2, "cs_2");
  });

  it("a Stripe expire failure does not undo the cancel and does not throw", async () => {
    const runCancel = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1"] },
    ]);
    const expireSession = vi.fn().mockRejectedValue(new Error("stripe_down"));
    const emit = vi.fn();

    const result = await cancelUnpaidForCustomerWithDeps(
      { runCancel, expireSession, canExpire: true, emit },
      "VT-25-00001",
    );

    expect(result).toEqual({ cancelled: true });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.any(String), "cs_1", expect.any(Error));
  });

  it("never calls Stripe when canExpire is false (legacy UAE test account)", async () => {
    const runCancel = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1"] },
    ]);
    const expireSession = vi.fn();
    const emit = vi.fn();

    const result = await cancelUnpaidForCustomerWithDeps(
      { runCancel, expireSession, canExpire: false, emit },
      "VT-25-00001",
    );

    expect(result).toEqual({ cancelled: true });
    expect(expireSession).not.toHaveBeenCalled();
  });

  it("a throwing runCancel (not found / not cancellable) propagates unhandled", async () => {
    const err = Object.assign(new Error("not_cancellable"), { code: "P0001" });
    const runCancel = vi.fn().mockRejectedValue(err);
    const expireSession = vi.fn();
    const emit = vi.fn();

    await expect(
      cancelUnpaidForCustomerWithDeps({ runCancel, expireSession, canExpire: true, emit }, "VT-25-00002"),
    ).rejects.toThrow("not_cancellable");
    expect(expireSession).not.toHaveBeenCalled();
  });
});

describe("cancelUnpaidForCustomer(env, claims, ref) wiring", () => {
  beforeEach(() => {
    asCustomer.mockReset();
    stripeFromEnv.mockReset();
    expireCheckoutSession.mockReset();
    stripeFromEnv.mockReturnValue({});
  });

  it("runs checkout_cancel_unpaid via asCustomer and expires the returned session", async () => {
    asCustomer.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async () => [
        { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1"] },
      ];
      return fn(sql);
    });
    expireCheckoutSession.mockResolvedValue({});
    const env = { STRIPE_SECRET_KEY: "sk_test_cancel", STRIPE_PUBLISHABLE_KEY: "pk_test_normal" } as CloudflareEnv;

    const result = await cancelUnpaidForCustomer(env, CLAIMS, "VT-25-00001");

    expect(result).toEqual({ cancelled: true });
    expect(asCustomer).toHaveBeenCalledWith(env, CLAIMS, expect.any(Function));
    expect(expireCheckoutSession).toHaveBeenCalledWith(expect.anything(), "cs_1");
  });

  it("does not call Stripe on the legacy UAE test publishable key", async () => {
    asCustomer.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async () => [
        { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1"] },
      ];
      return fn(sql);
    });
    const env = {
      STRIPE_SECRET_KEY: "sk_test_cancel",
      STRIPE_PUBLISHABLE_KEY: "pk_test_51U65pWlegacy",
    } as CloudflareEnv;

    const result = await cancelUnpaidForCustomer(env, CLAIMS, "VT-25-00001");

    expect(result).toEqual({ cancelled: true });
    expect(stripeFromEnv).not.toHaveBeenCalled();
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });
});
