import { describe, expect, it, vi } from "vitest";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import type { CheckoutIntentRequest } from "./intent-schema";
import { createBooking } from "./create-booking";

const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const EXP = "2026-09-05T13:00:00.000Z";

function payload(): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-000000000001",
    exp: EXP,
    engine_version: "quote-engine@test",
    rate_version_id: 1,
    settings_version_id: 1,
    computed_at: NOW,
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    extras: null,
    coupon: null,
    class_totals: [{ slug: "economy", total_rappen: 8000 }],
    legs: [
      {
        leg_seq: 1,
        pickup: { lng: 8.5, lat: 47.4, text: "ZRH" },
        dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
        scheduled_local: "2026-09-06T10:00:00",
        distance_m: 12000,
        duration_s: 1200,
        origin_zone_id: null,
        dest_zone_id: null,
        waypoints: [],
        flight_no: null,
        landing_source: null,
      },
    ],
  };
}

async function bodyFor(p: QuoteLockPayload): Promise<CheckoutIntentRequest> {
  const lock = await mintLock(SECRETS, p);
  return {
    quote_id: p.quote_id,
    lock,
    vehicle_class: "economy",
    contact: { name: "Ada", email: "ada@example.test", phone: "+417****0000" },
    locale: "en",
    display_currency: "CHF",
    idempotency_key: "idem-1",
  };
}

type Recorder = { calls: string[] };

function deps(p: QuoteLockPayload, rec: Recorder, patch: Partial<CheckoutIntentDeps> = {}): CheckoutIntentDeps {
  return {
    lockSecrets: SECRETS,
    workerNowIso: NOW,
    postgresNowIso: NOW,
    reprice: () => ({
      pricing_live: true,
      engine_version: p.engine_version,
      classes: [{ slug: "economy", total_rappen: 8000, eligible: true }],
    }),
    verifyTurnstile: async () => true,
    mintManageToken: async () => ({
      raw: "raw-token",
      hash: new Uint8Array(32),
    }),
    manageLinkMaxAgeSeconds: 1800,
    createCheckoutSession: async () => {
      rec.calls.push("stripe:create");
      return {
        id: "cs_test_new",
        client_secret: "cs_test_new_secret",
        payment_intent: "pi_test_new",
        status: "open",
      } as never;
    },
    expireCheckoutSession: async (id) => {
      rec.calls.push(`session.expire:${id}`);
    },
    retrieveCheckoutSession: async () =>
      ({
        id: "cs_test_new",
        client_secret: "cs_test_new_secret",
        payment_intent: "pi_test_new",
        status: "open",
      }) as never,
    createBooking: async () => {
      rec.calls.push("rpc");
      return {
        booking_id: "00000000-0000-4000-8000-000000000099",
        reference: "VT-10001",
        snapshot_id: 1,
        payment_id: 1,
        replayed: false,
      };
    },
    attachPayment: async () => {
      rec.calls.push("attach");
      const err = Object.assign(new Error("already"), { code: "23001" });
      throw err;
    },
    publishableKey: "pk_test_placeholder",
    returnUrl: "https://vamostaxi.site/en/checkout",
    checkoutWindowMinutes: 30,
    actorCustomerId: null,
    ...patch,
  };
}

describe("createBooking module", () => {
  it("is the named checkout write helper", () => {
    expect(typeof createBooking).toBe("function");
  });
});

describe("POST /api/checkout/intent recorder", () => {
  it("happy path does not call session.expire", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const res = await runCheckoutIntent(await bodyFor(p), deps(p, rec));
    expect(res.status).toBe(200);
    expect(rec.calls.some((c) => c.startsWith("session.expire"))).toBe(false);
    const json = (await res.json()) as { reference: string; amount_rappen: number };
    expect(json.reference).toBe("VT-10001");
    expect(json.amount_rappen).toBe(8000);
  });

  it("preflight:exit on bad HMAC never reaches Stripe or the RPC", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const body = await bodyFor(p);
    body.lock = "v1.not-a-lock.mac";
    const res = await runCheckoutIntent(body, deps(p, rec));
    expect(res.status).toBe(404);
    expect(rec.calls).toEqual([]);
  });

  it("preflight:exit on quote_expired never reaches Stripe", async () => {
    const p = payload();
    p.exp = "2026-09-05T11:00:00.000Z";
    const rec: Recorder = { calls: [] };
    const res = await runCheckoutIntent(await bodyFor(p), deps(p, rec));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
    expect(rec.calls).toEqual([]);
  });

  it("RPC 23P01 maps to payment_window_closed and records session.expire", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const err = Object.assign(new Error("exclusion"), { code: "23P01" });
    const res = await runCheckoutIntent(
      await bodyFor(p),
      deps(p, rec, {
        createBooking: async () => {
          rec.calls.push("rpc");
          throw err;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("payment_window_closed");
    expect(rec.calls.filter((c) => c.startsWith("session.expire"))).toEqual([
      "session.expire:cs_test_new",
    ]);
  });

  it("replayed closed stored session is payment_window_closed and records session.expire", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const res = await runCheckoutIntent(
      await bodyFor(p),
      deps(p, rec, {
        retrieveCheckoutSession: async () =>
          ({
            id: "cs_test_stored",
            client_secret: null,
            status: "expired",
          }) as never,
        createBooking: async () => {
          rec.calls.push("rpc");
          return {
            booking_id: "00000000-0000-4000-8000-000000000099",
            reference: "VT-10001",
            snapshot_id: 1,
            payment_id: 1,
            replayed: true,
          };
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("payment_window_closed");
    expect(rec.calls.some((c) => c.startsWith("session.expire"))).toBe(true);
  });

  it("replayed open stored session with a different id records session.expire of the orphan", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const res = await runCheckoutIntent(
      await bodyFor(p),
      deps(p, rec, {
        retrieveCheckoutSession: async () =>
          ({
            id: "cs_test_stored",
            client_secret: "cs_test_stored_secret",
            status: "open",
          }) as never,
        createBooking: async () => {
          rec.calls.push("rpc");
          return {
            booking_id: "00000000-0000-4000-8000-000000000099",
            reference: "VT-10001",
            snapshot_id: 1,
            payment_id: 1,
            replayed: true,
          };
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(rec.calls.filter((c) => c.startsWith("session.expire"))).toEqual([
      "session.expire:cs_test_new",
    ]);
  });

  it("Turnstile failure is preflight:exit before Stripe", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const res = await runCheckoutIntent(
      await bodyFor(p),
      deps(p, rec, { verifyTurnstile: async () => false }),
    );
    expect(res.status).toBe(400);
    expect(rec.calls).toEqual([]);
  });

  it("23505 maps to quote_already_booked after session.expire", async () => {
    const p = payload();
    const rec: Recorder = { calls: [] };
    const err = Object.assign(new Error("unique"), { code: "23505" });
    const res = await runCheckoutIntent(
      await bodyFor(p),
      deps(p, rec, {
        createBooking: async () => {
          throw err;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(rec.calls.some((c) => c.startsWith("session.expire"))).toBe(true);
  });
});
