import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { extraFaresOn } from "./extras-catalog";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import type { CheckoutIntentRequest } from "./intent-schema";

const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const EXP = "2026-09-05T13:00:00.000Z";
const here = dirname(fileURLToPath(import.meta.url));

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
    coupon: null,
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
    mintManageToken: async () => ({
      raw: "raw-token",
      hash: new Uint8Array(32),
    }),
    issueManageToken: async () => undefined,
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
    retrieveCheckoutSession: async () =>
      ({
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
        status: "open",
      }) as never,
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
    attachPayment: async () => {
      const err = Object.assign(new Error("already"), { code: "23001" });
      throw err;
    },
    loadOpenPayment: async () => null,
    publishableKey: "pk_test_placeholder",
    returnUrl: "https://vamostaxi.site/en/checkout",
    checkoutWindowMinutes: 30,
    actorCustomerId: null,
    vehicleClassId: "00000000-0000-4000-8000-0000000000aa",
    snapshotPolicy: {
      cancellation_tiers: [],
      free_cancel_hours: null,
      airport_waiting_minutes: null,
      city_waiting_minutes: null,
      settings_version_id: 1,
      modification_deadline_hours: null,
      min_advance_minutes: null,
      policy_doc: null,
    },
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
    const create = vi.fn(async () => {
      throw new Error("should not create");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
    expect(create).not.toHaveBeenCalled();
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

  it("returns 503 with no code for the UAE prefix and does not retrieve or create", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => {
      throw new Error("should not create");
    });
    const retrieve = vi.fn(async () => {
      throw new Error("should not retrieve");
    });
    const expire = vi.fn(async () => {
      throw new Error("should not expire");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        publishableKey: "pk_test_51U65pW",
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        retrieveCheckoutSession: retrieve as unknown as CheckoutIntentDeps["retrieveCheckoutSession"],
        expireCheckoutSession: expire as unknown as CheckoutIntentDeps["expireCheckoutSession"],
      }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it("returns 409 pricing_not_live for the UAE prefix when pricing is not live", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => {
      throw new Error("should not create");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        publishableKey: "pk_test_51U65pW",
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        reprice: () => ({
          pricing_live: false,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: null, eligible: true }],
        }),
      }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("pricing_not_live");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns pricing_not_live for an empty vehicle class id", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => {
      throw new Error("should not create");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        vehicleClassId: "",
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
      }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("pricing_not_live");
    expect(json.code).not.toBe("invalid_request");
    expect(create).not.toHaveBeenCalled();
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

  it("expires an orphan session when replayed=true against a different stored session", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const expire = vi.fn(async () => undefined);
    const create = vi.fn(async () => ({
      id: "cs_test_new",
      client_secret: "cs_test_new_secret",
      payment_intent: "pi_test_new",
      status: "open",
    }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        expireCheckoutSession: expire,
        retrieveCheckoutSession: async () =>
          ({
            id: "cs_test_stored",
            client_secret: "cs_test_stored_secret",
            payment_intent: "pi_test_stored",
            status: "open",
          }) as never,
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
    expect(expire).toHaveBeenCalledWith("cs_test_new");
    expect(((await res.json()) as { checkout_session_id: string }).checkout_session_id).toBe(
      "cs_test_stored",
    );
  });

  it("happy path returns client_secret, reference, publishable key, Set-Cookie", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, string | number>;
    expect(json.client_secret).toBe("cs_test_1_secret");
    expect(json.reference).toBe("VT-10001");
    expect(json.checkout_session_id).toBe("cs_test_1");
    expect(json.currency).toBe("CHF");
    expect(json.amount_rappen).toBe(8648);
    expect(json.publishable_key).toBe("pk_test_placeholder");
    expect(res.headers.get("cache-control")).toMatch(/no-store/i);
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

  it("sends RPC legs with pickup_text and vehicle_class_id", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const rpc = vi.fn(async (args: { legs: unknown; snapshot: Record<string, unknown> }) => {
      const legs = args.legs as { pickup_text: string; vehicle_class_id: string }[];
      expect(legs[0]?.pickup_text).toBe("ZRH");
      expect(legs[0]?.vehicle_class_id).toBe("00000000-0000-4000-8000-0000000000aa");
      expect(args.snapshot.vehicle_class_id).toBe("00000000-0000-4000-8000-0000000000aa");
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
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
      }),
    );
    expect(rpc).toHaveBeenCalled();
  });

  it("retrieves client_secret before creating a booking", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const rpc = vi.fn(async () => ({
      booking_id: "00000000-0000-4000-8000-000000000099",
      reference: "VT-10001",
      snapshot_id: 1,
      payment_id: 1,
      replayed: false,
    }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: async () =>
          ({ id: "cs_test_1", client_secret: null, payment_intent: null, status: "open" }) as never,
        retrieveCheckoutSession: async () =>
          ({
            id: "cs_test_1",
            client_secret: "cs_test_1_secret",
            payment_intent: null,
            status: "open",
          }) as never,
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
      }),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalled();
    expect(((await res.json()) as { client_secret: string }).client_secret).toBe("cs_test_1_secret");
  });

  it("does not insert a booking when Stripe returns no client_secret", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const rpc = vi.fn(async () => ({
      booking_id: "00000000-0000-4000-8000-000000000099",
      reference: "VT-10001",
      snapshot_id: 1,
      payment_id: 1,
      replayed: false,
    }));
    const expire = vi.fn(async () => undefined);
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: async () =>
          ({ id: "cs_test_1", client_secret: null, payment_intent: null, status: "open" }) as never,
        retrieveCheckoutSession: async () =>
          ({ id: "cs_test_1", client_secret: null, payment_intent: null, status: "open" }) as never,
        expireCheckoutSession: expire,
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("invalid_request");
    expect(rpc).not.toHaveBeenCalled();
    expect(expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("reuses the unpaid session when the quote already has a booking", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => ({
      id: "cs_test_new",
      client_secret: "cs_test_new_secret",
      payment_intent: null,
      status: "open",
    }));
    const rpc = vi.fn(async () => {
      throw new Error("should not create");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
        loadOpenPayment: async () => ({
          booking_id: "00000000-0000-4000-8000-000000000099",
          reference: "VT-26-0708",
          stripe_checkout_session_id: "cs_test_stored",
        }),
        retrieveCheckoutSession: async () =>
          ({
            id: "cs_test_stored",
            client_secret: "cs_test_stored_secret",
            status: "open",
          }) as never,
      }),
    );
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    const json = (await res.json()) as {
      reference: string;
      client_secret: string;
      checkout_session_id: string;
    };
    expect(json.reference).toBe("VT-26-0708");
    expect(json.client_secret).toBe("cs_test_stored_secret");
    expect(json.checkout_session_id).toBe("cs_test_stored");
    expect(res.headers.get("set-cookie")).toContain("vt_manage=raw-token");
  });

  it("reuses the unpaid session when createBooking raises 23001", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const err = Object.assign(new Error("quote_already_booked"), { code: "23001" });
    const expire = vi.fn(async () => undefined);
    let openCalls = 0;
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: async () =>
          ({
            id: "cs_test_new",
            client_secret: "cs_test_new_secret",
            payment_intent: null,
            status: "open",
          }) as never,
        expireCheckoutSession: expire,
        createBooking: async () => {
          throw err;
        },
        loadOpenPayment: async () => {
          openCalls += 1;
          if (openCalls === 1) return null;
          return {
            booking_id: "00000000-0000-4000-8000-000000000099",
            reference: "VT-26-0709",
            stripe_checkout_session_id: "cs_test_stored",
          };
        },
        retrieveCheckoutSession: async (id: string) =>
          (id === "cs_test_stored"
            ? {
                id: "cs_test_stored",
                client_secret: "cs_test_stored_secret",
                status: "open",
              }
            : {
                id: "cs_test_new",
                client_secret: "cs_test_new_secret",
                status: "open",
              }) as never,
      }),
    );
    expect(res.status).toBe(200);
    expect(expire).toHaveBeenCalledWith("cs_test_new");
    const json = (await res.json()) as { reference: string; client_secret: string };
    expect(json.reference).toBe("VT-26-0709");
    expect(json.client_secret).toBe("cs_test_stored_secret");
  });

  it("attaches a new session when the unpaid session is expired", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const err = Object.assign(new Error("quote_already_booked"), { code: "23001" });
    const attach = vi.fn(async () => ({
      booking_id: "00000000-0000-4000-8000-000000000099",
      reference: "VT-26-0710",
      snapshot_id: 1,
      payment_id: 2,
      replayed: false,
    }));
    const expire = vi.fn(async () => undefined);
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        expireCheckoutSession: expire,
        createBooking: async () => {
          throw err;
        },
        attachPayment: attach,
        loadOpenPayment: async () => ({
          booking_id: "00000000-0000-4000-8000-000000000099",
          reference: "VT-26-0710",
          stripe_checkout_session_id: "cs_test_expired",
        }),
        retrieveCheckoutSession: async (id: string) =>
          (id === "cs_test_expired"
            ? { id: "cs_test_expired", client_secret: null, status: "expired" }
            : {
                id: "cs_test_1",
                client_secret: "cs_test_1_secret",
                payment_intent: "pi_test_1",
                status: "open",
              }) as never,
      }),
    );
    expect(res.status).toBe(200);
    expect(attach).toHaveBeenCalled();
    expect(expire).toHaveBeenCalledWith("cs_test_expired");
    const json = (await res.json()) as { reference: string; client_secret: string };
    expect(json.reference).toBe("VT-26-0710");
    expect(json.client_secret).toBe("cs_test_1_secret");
  });

  it("charges extras selected after the lock and pins them on the snapshot", async () => {
    const p = payload();
    const body = await bodyFor(p);
    body.extras = { child_seats: 1 };
    let charged = 0;
    const seen: Array<{
      lines?: Array<{ code: string; amount_rappen: number }>;
      policy?: { extras?: string[] };
    }> = [];
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        extrasCatalog: [
          { code: "child_seat", kind: "amount", amount_rappen: 2000, percent: null, toggle: true },
        ],
        createCheckoutSession: async (input) => {
          charged = input.chargedRappen;
          return {
            id: "cs_test_1",
            client_secret: "cs_test_1_secret",
            payment_intent: "pi_test_1",
            status: "open",
          } as never;
        },
        createBooking: async (args) => {
          seen.push(args.snapshot as (typeof seen)[number]);
          return {
            booking_id: "00000000-0000-4000-8000-000000000099",
            reference: "VT-10001",
            snapshot_id: 1,
            payment_id: 1,
            replayed: false,
          };
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(charged).toBe(10810);
    expect(seen[0]?.policy?.extras).toEqual(["child_seat"]);
    expect(seen[0]?.lines).toEqual([
      expect.objectContaining({ code: "distance_fare", amount_rappen: 8810 }),
      expect.objectContaining({ code: "child_seat", amount_rappen: 2000 }),
    ]);
  });

  it("refuses bookings.is_test and never creates a Stripe session (D-33)", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => {
      throw new Error("must not create Stripe session");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        loadQuotePayGate: async () => ({ is_test: true }),
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("invalid_request");
    expect(create).not.toHaveBeenCalled();
  });

  it("charges the locked snapshot amount before expiry", async () => {
    const p = payload();
    const body = await bodyFor(p);
    let charged = 0;
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: async (input) => {
          charged = input.chargedRappen;
          return {
            id: "cs_test_1",
            client_secret: "cs_test_1_secret",
            payment_intent: "pi_test_1",
            status: "open",
          } as never;
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(charged).toBe(8648);
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(8648);
  });

  it("does not add waiting extra CHF to the payable snapshot (D-38)", async () => {
    expect(
      extraFaresOn(
        [
          {
            code: "waiting_airport",
            kind: "amount",
            amount_rappen: 4000,
            percent: null,
            toggle: true,
          },
          { code: "child_seat", kind: "amount", amount_rappen: 2000, percent: null, toggle: true },
        ],
        () => true,
      ),
    ).toEqual([{ code: "child_seat", amount_rappen: 2000 }]);
    const p = payload();
    const body = await bodyFor(p);
    body.extras = { child_seats: 1 };
    let charged = 0;
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        extrasCatalog: [
          {
            code: "waiting_airport",
            kind: "amount",
            amount_rappen: 4000,
            percent: null,
            toggle: true,
          },
          { code: "child_seat", kind: "amount", amount_rappen: 2000, percent: null, toggle: true },
        ],
        createCheckoutSession: async (input) => {
          charged = input.chargedRappen;
          return {
            id: "cs_test_1",
            client_secret: "cs_test_1_secret",
            payment_intent: "pi_test_1",
            status: "open",
          } as never;
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(charged).toBe(10810);
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(10810);
  });
});

describe("18-08 Stripe gates", () => {
  it("has no sk_live_ and does not filter payment methods (D-26)", () => {
    for (const name of ["intent.ts", "settle.ts", "webhook.ts", "stripe.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/sk_live_/);
    }
    const stripe = readFileSync(join(here, "stripe.ts"), "utf8");
    expect(stripe).toMatch(/Do not pass `payment_method_types`/);
  });
});
