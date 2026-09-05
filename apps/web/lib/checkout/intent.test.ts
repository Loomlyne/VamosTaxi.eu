import { describe, expect, it, vi } from "vitest";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import type { CheckoutIntentRequest } from "./intent-schema";

const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const EXP = "2026-09-05T13:00:00.000Z";

function payload(overrides: Partial<QuoteLockPayload> = {}): QuoteLockPayload {
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
    ...overrides,
  };
}

async function bodyFor(p: QuoteLockPayload): Promise<CheckoutIntentRequest> {
  const lock = await mintLock(SECRETS, p);
  return {
    quote_id: p.quote_id,
    lock,
    vehicle_class: "economy",
    contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
    locale: "en",
    display_currency: "CHF",
    idempotency_key: "idem-1",
  };
}

function deps(p: QuoteLockPayload, patch: Partial<CheckoutIntentDeps> = {}): CheckoutIntentDeps {
  const order: string[] = [];
  const base: CheckoutIntentDeps = {
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
      order.push("stripe");
      return {
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
        currency: "chf",
      } as never;
    },
    expireCheckoutSession: async () => {
      order.push("expire");
    },
    createBooking: async () => {
      order.push("rpc");
      return {
        booking_id: "00000000-0000-4000-8000-000000000099",
        reference: "VT-10001",
        snapshot_id: 1,
        payment_id: 1,
        replayed: false,
      };
    },
    publishableKey: "pk_test_placeholder",
    returnUrl: "https://vamostaxi.site/en/checkout",
    checkoutWindowMinutes: 30,
    actorCustomerId: null,
    ...patch,
  };
  (base as CheckoutIntentDeps & { order: string[] }).order = order;
  return base;
}

describe("runCheckoutIntent", () => {
  it("returns 404 for a bad HMAC without leaking why", async () => {
    const p = payload();
    const body = await bodyFor(p);
    body.lock = "v1.not-a-lock.mac";
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "quote_not_found", action: "requote" });
  });

  it("returns 409 quote_expired", async () => {
    const p = payload({ exp: "2026-09-05T11:00:00.000Z" });
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
  });

  it("returns 409 pricing_not_live", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        reprice: () => ({
          pricing_live: false,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: null, eligible: true }],
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("pricing_not_live");
  });

  it("returns 409 price_changed", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        reprice: () => ({
          pricing_live: true,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: 9000, eligible: true }],
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
  });

  it("maps P0002 to coupon_no_longer_valid", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const err = Object.assign(new Error("no coupon"), { code: "P0002" });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createBooking: async () => {
          throw err;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
  });

  it("maps 23505 to quote_already_booked", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const err = Object.assign(new Error("unique"), { code: "23505" });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createBooking: async () => {
          throw err;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
  });

  it("maps 23P01 to payment_window_closed", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const err = Object.assign(new Error("exclusion"), { code: "23P01" });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createBooking: async () => {
          throw err;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("payment_window_closed");
  });

  it("does not keep a leftover session when replayed=true", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const expire = vi.fn(async () => undefined);
    const create = vi.fn(async () => ({
      id: "cs_test_1",
      client_secret: "cs_test_1_secret",
      payment_intent: "pi_test_1",
    }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        expireCheckoutSession: expire,
        createBooking: async () => ({
          booking_id: "00000000-0000-4000-8000-000000000099",
          reference: "VT-10001",
          snapshot_id: 1,
          payment_id: 1,
          replayed: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("happy path returns client_secret, booking ids, publishable key, Set-Cookie", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, string>;
    expect(json.client_secret).toBe("cs_test_1_secret");
    expect(json.booking_id).toBe("00000000-0000-4000-8000-000000000099");
    expect(json.booking_reference).toBe("VT-10001");
    expect(json.publishable_key).toBe("pk_test_placeholder");
    expect(res.headers.get("set-cookie")).toContain("vt_manage=raw-token");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("forwards idempotency_key to Stripe and the RPC", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async (input: { idempotencyKey: string }) => {
      expect(input.idempotencyKey).toBe("idem-1");
      return {
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
      };
    });
    const rpc = vi.fn(async (args: { idempotencyKey: string }) => {
      expect(args.idempotencyKey).toBe("idem-1");
      return {
        booking_id: "00000000-0000-4000-8000-000000000099",
        reference: "VT-10001",
        snapshot_id: 1,
        payment_id: 1,
        replayed: false,
      };
    });
    await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
      }),
    );
    expect(create).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalled();
  });
});
