// apps/web/lib/checkout/expire-unpaid.test.ts
//
// Plan 26.1-06 (D-04): the hourly cron expires every open Stripe Checkout
// Session of each booking it cancels, not just the DB row. Pure deps
// function tested directly; the env-wired entry point tested by mocking its
// three collaborators (asSystem/stripeFromEnv/expireCheckoutSession/lock-mail).

import { beforeEach, describe, expect, it, vi } from "vitest";

const asSystem = vi.fn();
const stripeFromEnv = vi.fn();
const expireCheckoutSession = vi.fn();
const notifyExpiredForBookings = vi.fn();

vi.mock("../db/identity", () => ({
  asSystem: (...args: unknown[]) => asSystem(...args),
}));

vi.mock("./stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe")>();
  return {
    ...actual,
    stripeFromEnv: (...args: unknown[]) => stripeFromEnv(...args),
    expireCheckoutSession: (...args: unknown[]) => expireCheckoutSession(...args),
  };
});

vi.mock("./lock-mail", () => ({
  notifyExpiredForBookings: (...args: unknown[]) => notifyExpiredForBookings(...args),
}));

import { expireUnpaidBookings, expireUnpaidBookingsWithDeps } from "./expire-unpaid";

const ENV = { STRIPE_SECRET_KEY: "sk_test_expire" } as CloudflareEnv;

describe("expireUnpaidBookingsWithDeps (pure, D-04)", () => {
  it("calls expireSession once per returned session id across every booking", async () => {
    const expireSession = vi.fn().mockResolvedValue(undefined);
    const notifyExpired = vi.fn().mockResolvedValue(2);
    const runExpire = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1", "cs_2"] },
      { booking_id: "b2", reference: "VT-2", stripe_checkout_session_ids: ["cs_3"] },
    ]);
    const emit = vi.fn();

    const count = await expireUnpaidBookingsWithDeps({ runExpire, expireSession, notifyExpired, emit });

    expect(count).toBe(2);
    expect(expireSession).toHaveBeenCalledTimes(3);
    expect(expireSession).toHaveBeenNthCalledWith(1, "cs_1");
    expect(expireSession).toHaveBeenNthCalledWith(2, "cs_2");
    expect(expireSession).toHaveBeenNthCalledWith(3, "cs_3");
    expect(emit).not.toHaveBeenCalled();
  });

  it("continues past a failing session id and emits one error per failure", async () => {
    const expireSession = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("stripe_down"))
      .mockResolvedValueOnce(undefined);
    const notifyExpired = vi.fn().mockResolvedValue(1);
    const runExpire = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1", "cs_2", "cs_3"] },
    ]);
    const emit = vi.fn();

    const count = await expireUnpaidBookingsWithDeps({ runExpire, expireSession, notifyExpired, emit });

    expect(count).toBe(1);
    expect(expireSession).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(expect.any(String), "cs_2", expect.any(Error));
  });

  it("still sends the expired mails even when a session id list is empty", async () => {
    const expireSession = vi.fn().mockResolvedValue(undefined);
    const notifyExpired = vi.fn().mockResolvedValue(1);
    const runExpire = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: [] },
    ]);
    const emit = vi.fn();

    await expireUnpaidBookingsWithDeps({ runExpire, expireSession, notifyExpired, emit });

    expect(expireSession).not.toHaveBeenCalled();
    expect(notifyExpired).toHaveBeenCalledWith(["b1"]);
  });

  it("returns the cancelled count from runExpire's row count, not the session count", async () => {
    const expireSession = vi.fn().mockResolvedValue(undefined);
    const notifyExpired = vi.fn().mockResolvedValue(0);
    const runExpire = vi.fn().mockResolvedValue([
      { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1", "cs_2"] },
      { booking_id: "b2", reference: "VT-2", stripe_checkout_session_ids: null },
    ]);
    const emit = vi.fn();

    const count = await expireUnpaidBookingsWithDeps({ runExpire, expireSession, notifyExpired, emit });

    expect(count).toBe(2);
    expect(expireSession).toHaveBeenCalledTimes(2);
  });
});

describe("expireUnpaidBookings(env) wiring", () => {
  beforeEach(() => {
    asSystem.mockReset();
    stripeFromEnv.mockReset();
    expireCheckoutSession.mockReset();
    notifyExpiredForBookings.mockReset();
    stripeFromEnv.mockReturnValue({});
  });

  it("wires asSystem's RPC rows into expireCheckoutSession and notifyExpiredForBookings", async () => {
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async () => [
        { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1"] },
      ];
      return fn(sql);
    });
    expireCheckoutSession.mockResolvedValue({});
    notifyExpiredForBookings.mockResolvedValue(1);

    const count = await expireUnpaidBookings(ENV);

    expect(count).toBe(1);
    expect(expireCheckoutSession).toHaveBeenCalledWith(expect.anything(), "cs_1");
    expect(notifyExpiredForBookings).toHaveBeenCalledWith(ENV, ["b1"]);
  });

  it("a Stripe expire failure does not stop the cron or throw", async () => {
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async () => [
        { booking_id: "b1", reference: "VT-1", stripe_checkout_session_ids: ["cs_1", "cs_2"] },
      ];
      return fn(sql);
    });
    expireCheckoutSession.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({});
    notifyExpiredForBookings.mockResolvedValue(1);

    await expect(expireUnpaidBookings(ENV)).resolves.toBe(1);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(2);
  });
});
