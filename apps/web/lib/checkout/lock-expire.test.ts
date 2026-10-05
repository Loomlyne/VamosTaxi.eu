// apps/web/lib/checkout/lock-expire.test.ts
//
// Security S8 (2026-10-05): a quote id alone no longer expires someone else's Stripe page. The
// caller holds the payment (vt_manage cookie owns the booking, or the open session id), and the
// call is rate limited (S12).

import { describe, expect, it } from "vitest";
import { runLockExpire, type LockExpireDeps } from "./lock-expire";

const QUOTE = "00000000-0000-4000-8000-000000000001";
const SESSION = "cs_test_a1B2c3D4e5";
const BOOKING = "00000000-0000-4000-8000-0000000000b1";

function deps(patch: Partial<LockExpireDeps> = {}) {
  const calls: string[] = [];
  const d: LockExpireDeps = {
    allowed: async () => true,
    loadOpenPayment: async () => {
      calls.push("load");
      return { booking_id: BOOKING, reference: "VT-26-0001", stripe_checkout_session_id: SESSION };
    },
    ownsBooking: async () => {
      calls.push("owns");
      return false;
    },
    stripeReady: () => true,
    expireCheckoutSession: async (id) => {
      calls.push(`expire:${id}`);
    },
    ...patch,
  };
  return { d, calls };
}

async function code(res: Response): Promise<unknown> {
  return ((await res.json()) as { code?: unknown }).code;
}

describe("S8: lock-expire needs the payment, not just the quote id", () => {
  it("a quote id alone is refused 403 and Stripe is never called", async () => {
    const { d, calls } = deps();
    const res = await runLockExpire({ quote_id: QUOTE }, d);
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("not_owner");
    expect(calls.some((c) => c.startsWith("expire:"))).toBe(false);
  });

  it("a wrong or malformed session id is refused the same way", async () => {
    for (const session_id of ["cs_test_other", "not-a-session", 12]) {
      const { d, calls } = deps();
      const res = await runLockExpire({ quote_id: QUOTE, session_id }, d);
      expect(res.status, String(session_id)).toBe(403);
      expect(calls.some((c) => c.startsWith("expire:"))).toBe(false);
    }
  });

  it("the pay-link page's own open session id expires it", async () => {
    const { d, calls } = deps();
    const res = await runLockExpire({ quote_id: QUOTE, session_id: SESSION }, d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual(["load", `expire:${SESSION}`]);
  });

  it("a vt_manage cookie that owns the booking expires it", async () => {
    const { d, calls } = deps({
      ownsBooking: async (id) => {
        calls.push("owns");
        return id === BOOKING;
      },
    });
    const res = await runLockExpire({ quote_id: QUOTE }, d);
    expect(res.status).toBe(200);
    expect(calls).toEqual(["load", "owns", `expire:${SESSION}`]);
  });

  it("an ownership check that throws is a refusal", async () => {
    const { d, calls } = deps({
      ownsBooking: async () => {
        throw new Error("db");
      },
    });
    const res = await runLockExpire({ quote_id: QUOTE }, d);
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.startsWith("expire:"))).toBe(false);
  });

  it("no open session is still ok without any check (nothing to expire)", async () => {
    const { d, calls } = deps({ loadOpenPayment: async () => null });
    const res = await runLockExpire({ quote_id: QUOTE }, d);
    expect(res.status).toBe(200);
    expect(calls).toEqual([]);
  });

  it("S12: over the read limit answers 429 before the database is asked", async () => {
    const { d, calls } = deps({ allowed: async () => false });
    const res = await runLockExpire({ quote_id: QUOTE, session_id: SESSION }, d);
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(calls).toEqual([]);
  });

  it("keeps the old answers: bad body 400, lookup failure 503, Stripe failure 503", async () => {
    expect((await runLockExpire({ quote_id: "nope" }, deps().d)).status).toBe(400);
    const lookup = deps({
      loadOpenPayment: async () => {
        throw new Error("db");
      },
    });
    const failed = await runLockExpire({ quote_id: QUOTE, session_id: SESSION }, lookup.d);
    expect(failed.status).toBe(503);
    expect(await code(failed)).toBe("session_lookup_failed");
    const notReady = await runLockExpire({ quote_id: QUOTE, session_id: SESSION }, deps({ stripeReady: () => false }).d);
    expect(notReady.status).toBe(503);
    expect(await code(notReady)).toBe("session_not_expired");
  });
});
