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

  it("returns 409 pricing_not_live when the board says pricing is off even with a priced class (D-12)", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const create = vi.fn(async () => {
      throw new Error("should not create");
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        reprice: () => ({
          pricing_live: false,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: 8000, eligible: true }],
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("pricing_not_live");
    expect(create).not.toHaveBeenCalled();
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

  it("refuses coupon_no_longer_valid when the payer-identity re-evaluation refuses (D-11)", async () => {
    const p = payload({ coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    const create = vi.fn(async () => {
      throw new Error("must not create Stripe session");
    });
    const evaluateCoupon = vi.fn(async () => ({ ok: false, i18n_key: "quote.coupon.error.usage_cap" }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        evaluateCoupon,
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(create).not.toHaveBeenCalled();
    expect(evaluateCoupon).toHaveBeenCalledTimes(1);
    expect(evaluateCoupon).toHaveBeenCalledWith("SAVE10", { customerId: null, contactEmail: "ada@example.test" });
  });

  it("refuses coupon_no_longer_valid (fail closed) when a coupon is typed but evaluateCoupon is not wired", async () => {
    const p = payload({ coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    const res = await runCheckoutIntent(body, deps(p, { evaluateCoupon: undefined }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
  });

  it("passes the evaluated coupon_id to createBooking and discounts checkout extras too (D-08a, D-11)", async () => {
    const p = payload({ class_totals: [{ slug: "economy", total_rappen: 9000 }], coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    body.extras = { child_seats: 1 };
    const evaluateCoupon = vi.fn(async (code: string, ids: { customerId: string | null; contactEmail: string | null }) => {
      expect(code).toBe("SAVE10");
      expect(ids).toEqual({ customerId: null, contactEmail: "ada@example.test" });
      return { ok: true, i18n_key: null, coupon_id: 42, kind: "percent", percent: "10.00", amount_rappen: null, code: "SAVE10" };
    });
    let charged = 0;
    const seenCouponId: (number | null)[] = [];
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        evaluateCoupon,
        reprice: () => ({
          pricing_live: true,
          engine_version: p.engine_version,
          classes: [{ slug: "economy", total_rappen: 9000, eligible: true }],
        }),
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
          seenCouponId.push(args.couponId);
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
    expect(evaluateCoupon).toHaveBeenCalledTimes(1);
    expect(seenCouponId).toEqual([42]);
    // preCoupon 10000 (9000 grossed up from 10%) + extras 2000 = 12000; 10% off
    // = 1200; net 10800; VAT 8.1% = 875 (round-half-up of 874.8); 11675.
    expect(charged).toBe(11675);
  });

  it("refuses coupon_no_longer_valid when the cap trigger fires between evaluate and insert (D-11 race)", async () => {
    const p = payload({ coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    const createErr = Object.assign(new Error("coupon cap"), { code: "23001" });
    const attachErr = Object.assign(new Error("not found"), { code: "P0002" });
    const createBooking = vi.fn(async () => {
      throw createErr;
    });
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        evaluateCoupon: async () => ({
          ok: true,
          i18n_key: null,
          coupon_id: 42,
          kind: "amount",
          percent: null,
          amount_rappen: 500,
          code: "SAVE10",
        }),
        loadOpenPayment: async () => null,
        createBooking: createBooking as unknown as CheckoutIntentDeps["createBooking"],
        attachPayment: async () => {
          throw attachErr;
        },
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(createBooking).toHaveBeenCalledTimes(1);
  });

  it("refuses coupon_no_longer_valid when the lock priced a coupon but the body omits it (VERIFICATION probe)", async () => {
    const p = payload({ coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = null;
    const create = vi.fn(
      async () =>
        ({
          id: "cs_test_1",
          client_secret: "cs_test_1_secret",
          payment_intent: "pi_test_1",
          currency: "chf",
        }) as never,
    );
    const evaluateCoupon = vi.fn(async () => ({ ok: false, i18n_key: "quote.coupon.error.usage_cap" }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        evaluateCoupon,
      }),
    );
    expect({ status: res.status, evaluateCalls: evaluateCoupon.mock.calls.length }).toEqual({
      status: 409,
      evaluateCalls: 1,
    });
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(evaluateCoupon).toHaveBeenCalledWith("SAVE10", { customerId: null, contactEmail: "ada@example.test" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses coupon_no_longer_valid when the body coupon disagrees with the lock's coupon", async () => {
    const p = payload({ coupon: "SAVE10" });
    const body = await bodyFor(p);
    body.coupon = "OTHER10";
    const create = vi.fn(async () => {
      throw new Error("must not create Stripe session");
    });
    const createBooking = vi.fn(async () => {
      throw new Error("must not create a booking");
    });
    const evaluateCoupon = vi.fn(async () => ({
      ok: true,
      i18n_key: null,
      coupon_id: 42,
      kind: "percent",
      percent: "10.00",
      amount_rappen: null,
      code: "OTHER10",
    }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: createBooking as unknown as CheckoutIntentDeps["createBooking"],
        evaluateCoupon,
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(evaluateCoupon).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("refuses coupon_no_longer_valid when the lock priced no coupon but the body attaches one", async () => {
    const p = payload();
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    const create = vi.fn(async () => {
      throw new Error("must not create Stripe session");
    });
    const createBooking = vi.fn(async () => {
      throw new Error("must not create a booking");
    });
    const evaluateCoupon = vi.fn(async () => ({
      ok: true,
      i18n_key: null,
      coupon_id: 42,
      kind: "percent",
      percent: "10.00",
      amount_rappen: null,
      code: "SAVE10",
    }));
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: createBooking as unknown as CheckoutIntentDeps["createBooking"],
        evaluateCoupon,
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(evaluateCoupon).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("does not evaluate a coupon and creates the booking when neither the lock nor the body carry one", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const evaluateCoupon = vi.fn(async () => {
      throw new Error("must not evaluate a coupon");
    });
    const seenCouponId: (number | null)[] = [];
    const seenCouponCode: (string | null)[] = [];
    const res = await runCheckoutIntent(
      body,
      deps(p, {
        evaluateCoupon,
        createBooking: async (args) => {
          seenCouponId.push(args.couponId);
          seenCouponCode.push(args.couponCode);
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
    expect(evaluateCoupon).not.toHaveBeenCalled();
    expect(seenCouponId).toEqual([null]);
    expect(seenCouponCode).toEqual([null]);
  });

  it("accepts a lock coupon and body coupon that differ only in case", async () => {
    const p = payload({ coupon: "save10" });
    const body = await bodyFor(p);
    body.coupon = "SAVE10";
    const evaluateCoupon = vi.fn(async () => ({
      ok: true,
      i18n_key: null,
      coupon_id: 42,
      kind: "percent",
      percent: "10.00",
      amount_rappen: null,
      code: "SAVE10",
    }));
    const res = await runCheckoutIntent(body, deps(p, { evaluateCoupon }));
    expect(res.status).toBe(200);
    expect(evaluateCoupon).toHaveBeenCalledTimes(1);
    expect(evaluateCoupon).toHaveBeenCalledWith("SAVE10", { customerId: null, contactEmail: "ada@example.test" });
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
  it("has no sk_live_ and pins hosted methods only through the TWINT flag (D-20)", () => {
    for (const name of ["intent.ts", "settle.ts", "webhook.ts", "stripe.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/sk_live_/);
    }
    const stripe = readFileSync(join(here, "stripe.ts"), "utf8");
    expect(stripe).toMatch(/checkoutPaymentMethodTypes/);
  });
});

describe("runCheckoutIntent — flight number must match the lock (D-08b, 26.1-30)", () => {
  function flightLock(flight: string | null): QuoteLockPayload {
    const base = payload();
    const leg = base.legs[0]!;
    return payload({ legs: [{ ...leg, flight_no: flight }] });
  }

  async function run(p: QuoteLockPayload, flightNo: string | null | undefined) {
    const body = await bodyFor(p);
    if (flightNo !== undefined) body.flight_no = flightNo;
    const create = vi.fn(async () => ({
      id: "cs_test_1",
      client_secret: "cs_test_1_secret",
      payment_intent: "pi_test_1",
      currency: "chf",
    }));
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
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
      }),
    );
    return { res, create, rpc };
  }

  it("refuses price_changed when the details flight number is not in the lock — no Stripe, no booking", async () => {
    const { res, create, rpc } = await run(flightLock(null), "LX1234");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "price_changed", action: "requote" });
    expect(create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses price_changed when the flight number was removed after the lock priced it", async () => {
    const { res, create } = await run(flightLock("LX1234"), null);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses price_changed when the flight number differs from the lock's", async () => {
    const { res, create } = await run(flightLock("LX1234"), "LX999");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
    expect(create).not.toHaveBeenCalled();
  });

  it("proceeds when the flight number equals the lock's (case and spacing ignored)", async () => {
    const { res, create, rpc } = await run(flightLock("LX1234"), "lx 1234");
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalled();
  });

  it("proceeds when both are empty, and when an older client omits flight_no", async () => {
    const both = await run(flightLock(null), null);
    expect(both.res.status).toBe(200);
    const omitted = await run(flightLock("LX1234"), undefined);
    expect(omitted.res.status).toBe(200);
  });
});

describe("runCheckoutIntent — the pay-link hold keeps the traveller's lock payable (D-20, D-21, 26.1-29)", () => {
  // Lock ran out an hour ago; NOW is 12:00.
  const EXPIRED = "2026-09-05T11:00:00.000Z";

  async function run(
    p: QuoteLockPayload,
    patch: Partial<CheckoutIntentDeps> & { holdUntilIso?: string | null },
    tamper = false,
  ) {
    const body = await bodyFor(p);
    if (tamper) body.lock = `${body.lock.slice(0, -2)}xx`;
    const create = vi.fn(async () => ({
      id: "cs_test_1",
      client_secret: "cs_test_1_secret",
      payment_intent: "pi_test_1",
      currency: "chf",
    }));
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
        createCheckoutSession: create as unknown as CheckoutIntentDeps["createCheckoutSession"],
        createBooking: rpc as unknown as CheckoutIntentDeps["createBooking"],
        ...patch,
      } as Partial<CheckoutIntentDeps>),
    );
    return { res, create, rpc };
  }

  it("accepts an expired lock while the hold is still open", async () => {
    const { res, create } = await run(payload({ exp: EXPIRED }), {
      holdUntilIso: "2026-09-06T10:00:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
  });

  it("honours the hold on both clocks (Worker and Postgres)", async () => {
    const { res } = await run(payload({ exp: EXPIRED }), {
      holdUntilIso: "2026-09-05T12:30:00.000Z",
      workerNowIso: "2026-09-05T12:10:00.000Z",
      postgresNowIso: "2026-09-05T12:20:00.000Z",
    });
    expect(res.status).toBe(200);
  });

  it("refuses quote_expired when the lock and the hold are both past", async () => {
    const { res, create, rpc } = await run(payload({ exp: EXPIRED }), {
      holdUntilIso: "2026-09-05T11:30:00.000Z",
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
    expect(create).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses quote_expired when the hold is past on the Postgres clock only", async () => {
    const { res } = await run(payload({ exp: EXPIRED }), {
      holdUntilIso: "2026-09-05T12:30:00.000Z",
      workerNowIso: "2026-09-05T12:10:00.000Z",
      postgresNowIso: "2026-09-05T12:30:00.000Z",
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
  });

  it("still verifies the signature when a hold is open", async () => {
    const { res, create } = await run(
      payload({ exp: EXPIRED }),
      { holdUntilIso: "2026-09-06T10:00:00.000Z" },
      true,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("quote_not_found");
    expect(create).not.toHaveBeenCalled();
  });

  it("without a hold an expired lock is refused exactly as before", async () => {
    for (const hold of [undefined, null, "not-a-date"]) {
      const { res, create } = await run(payload({ exp: EXPIRED }), { holdUntilIso: hold });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe("quote_expired");
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("a hold earlier than the lock never shortens the lock", async () => {
    const { res } = await run(payload(), { holdUntilIso: "2026-09-05T11:00:00.000Z" });
    expect(res.status).toBe(200);
  });

  it("the intent route loads the hold from the database before runCheckoutIntent", () => {
    const src = readFileSync(join(here, "../../app/api/checkout/intent/route.ts"), "utf8");
    const read = src.indexOf("public.checkout_booking_hold_until(");
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(src.indexOf("return runCheckoutIntent("));
    expect(src).toMatch(/holdUntilIso[,:]/);
    expect(src).toContain("asCheckout(env, null");
    // The hold comes from the database, never the request body (T-26.1-90).
    expect(src).not.toMatch(/body\.hold_until|json\.hold_until/);
  });
});

// ---------------------------------------------------------------------------
// 26.3 plan 10: mode "web" — hosted page, generic extras, reuse, supersede.
// ---------------------------------------------------------------------------
describe("runCheckoutIntent mode web (26.3)", () => {
  const OLD_BOOKING = "00000000-0000-4000-8000-0000000000b1";
  const NEW_QUOTE = "00000000-0000-4000-8000-000000000002";
  const CATALOG = [
    { code: "child_seat", amountRappen: 1000, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "x" } },
    { code: "ski_bag", amountRappen: 2000, labels: { en: "Ski bag", de: "Skitasche", fr: "Sac de ski", ar: "x" } },
  ];
  const TRIP = {
    from: "ZRH", fid: "mbx-a", to: "Zurich", tid: "mbx-b",
    gs: "11111111-1111-4111-8111-111111111111",
    when: "2026-09-06T10:00", pax: 1, bags: 0, flight: null, flightDisplay: null,
    class: null, extras: [] as string[], resume: null, pay: null,
  };

  type Sess = { id: string; status: "open" | "expired" | "complete"; payment_status: "unpaid" | "paid"; amount: number };

  async function webBody(p: QuoteLockPayload, patch: Record<string, unknown> = {}) {
    const lock = await mintLock(SECRETS, p);
    return {
      quote_id: p.quote_id,
      lock,
      vehicle_class: "economy",
      extra_codes: [] as string[],
      coupon: null,
      contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
      locale: "en" as const,
      display_currency: "CHF" as const,
      company_name: "",
      company_address: "",
      company_vat: "",
      driver_note: "",
      trip: { ...TRIP },
      idempotency_key: "idem-w1",
      ...patch,
    } as never;
  }

  // In-memory Stripe + database. One pending row per booking, sessions per booking.
  function world(p: QuoteLockPayload, over: Partial<CheckoutIntentDeps> = {}) {
    const sessions = new Map<string, Sess>();
    const bookings = new Map<string, { quote: string; reference: string; sessions: string[]; charged: number }>();
    const calls: string[] = [];
    const created: Array<Record<string, unknown>> = [];
    const details: Array<Record<string, unknown>> = [];
    let n = 0;
    let bookingSeq = 0;
    const asSession = (s: Sess) =>
      ({
        id: s.id,
        status: s.status,
        payment_status: s.payment_status,
        currency: "chf",
        amount_total: s.amount,
        url: s.status === "open" ? `https://checkout.stripe.test/${s.id}` : null,
        payment_intent: null,
        expires_at: 1_790_000_000,
      }) as never;
    const d = deps(p, {
      mode: "web",
      origin: "https://vamostaxi.site",
      checkoutWindowMinutes: 31,
      loadCatalog: async () => CATALOG,
      ownsBooking: async () => false,
      createCheckoutSession: (async (input: Record<string, unknown>) => {
        created.push(input);
        n += 1;
        const s: Sess = { id: `cs_${n}`, status: "open", payment_status: "unpaid", amount: input.chargedRappen as number };
        sessions.set(s.id, s);
        calls.push(`create:${s.id}`);
        return asSession(s);
      }) as never,
      expireCheckoutSession: async (id) => {
        calls.push(`expire:${id}`);
        const s = sessions.get(id);
        if (s && s.status === "open") s.status = "expired";
      },
      retrieveCheckoutSession: async (id) => {
        const s = sessions.get(id);
        if (!s) throw new Error("no session");
        return asSession(s);
      },
      createBooking: async (a) => {
        calls.push("createBooking");
        for (const b of bookings.values()) if (b.quote === a.quoteId) throw Object.assign(new Error("dup"), { code: "23505" });
        bookingSeq += 1;
        const id = `booking-${bookingSeq}`;
        bookings.set(id, { quote: a.quoteId, reference: `VT-${20000 + bookingSeq}`, sessions: [a.stripeCheckoutSessionId], charged: a.chargedRappen });
        return { booking_id: id, reference: bookings.get(id)!.reference, snapshot_id: 1, payment_id: 1, replayed: false };
      },
      loadOpenPayment: async (quoteId) => {
        for (const [id, b] of bookings) {
          if (b.quote === quoteId) return { booking_id: id, reference: b.reference, stripe_checkout_session_id: b.sessions[b.sessions.length - 1]! };
        }
        return null;
      },
      attachPayment: async (a) => {
        calls.push("attach");
        for (const [id, b] of bookings) {
          if (b.quote === a.quoteId) {
            b.sessions.push(a.stripeCheckoutSessionId);
            return { booking_id: id, reference: b.reference, snapshot_id: 1, payment_id: 2, replayed: false };
          }
        }
        throw Object.assign(new Error("none"), { code: "P0002" });
      },
      listSessionIds: async (id) => [...(bookings.get(id)?.sessions ?? [])],
      purgeUnpaid: async (id, reason) => {
        calls.push(`purge:${id}:${reason}`);
        bookings.delete(id);
      },
      setBookingDetails: async (a) => {
        details.push(a);
      },
      ...over,
    });
    return { d, sessions, bookings, calls, created, details };
  }

  it("creates one pending booking priced by checkoutCharge with generic snapshot lines and a hosted session", async () => {
    const p = payload();
    const w = world(p);
    let snap: { lines: Array<{ code: string }>; policy: { extras: string[] }; total_rappen: number } | null = null;
    const base = w.d.createBooking;
    w.d.createBooking = async (a) => {
      snap = a.snapshot as never;
      return base(a);
    };
    const res = await runCheckoutIntent(
      await webBody(p, { extra_codes: ["child_seat", "ski_bag"], company_name: " Acme AG ", driver_note: " gate 4 " }),
      w.d as CheckoutIntentDeps & { mode: "web" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    // net 8000 + 1000 + 2000 = 11000; VAT 8.1 % on top = 11891
    expect(json.amount_rappen).toBe(11891);
    expect(json.url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_/);
    expect(json.ok).toBe(true);
    expect(json).not.toHaveProperty("client_secret");
    expect(json).not.toHaveProperty("publishable_key");
    expect(res.headers.get("set-cookie")).toMatch(/^vt_manage=/);
    expect(w.created[0]).toMatchObject({ uiMode: "hosted_page" });
    expect(String(w.created[0]!.successUrl)).toBe(
      "https://vamostaxi.site/api/checkout/return?locale=en&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(String(w.created[0]!.cancelUrl)).toContain("https://vamostaxi.site/checkout?");
    expect(String(w.created[0]!.cancelUrl)).toContain("fid=mbx-a");
    expect(String(w.created[0]!.cancelUrl)).toContain("tid=mbx-b");
    expect(String(w.created[0]!.cancelUrl)).toContain("gs=11111111");
    expect(String(w.created[0]!.cancelUrl)).toContain(`resume=${p.quote_id}`);
    expect(String(w.created[0]!.cancelUrl)).not.toContain("ada%40");
    expect((w.created[0]!.expiresAt as Date).toISOString()).toBe("2026-09-05T12:31:00.000Z");
    expect(snap!.policy.extras).toEqual(["child_seat", "ski_bag"]);
    expect(snap!.lines.map((l) => l.code)).toContain("ski_bag");
    expect(snap!.total_rappen).toBe(11891);
    expect(w.bookings.size).toBe(1);
    expect(w.details).toHaveLength(1);
    expect(w.details[0]).toMatchObject({ companyName: "Acme AG", driverNote: "gate 4" });
    expect(String(w.details[0]!.tripQuery)).toContain("fid=mbx-a");
  });

  it("refuses an unknown extra code as price_changed and creates nothing", async () => {
    const p = payload();
    const w = world(p);
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["helicopter"] }), w.d as never);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
    expect(w.created).toHaveLength(0);
    expect(w.bookings.size).toBe(0);
  });

  it("refuses a trip that disagrees with the signed lock (when, pax, bags, flight)", async () => {
    const p = payload();
    for (const trip of [
      { ...TRIP, when: "2026-09-06T11:00" },
      { ...TRIP, pax: 3 },
      { ...TRIP, bags: 2 },
      { ...TRIP, flight: "LX318" },
    ]) {
      const w = world(p);
      const res = await runCheckoutIntent(await webBody(p, { trip }), w.d as never);
      expect(((await res.json()) as { code: string }).code).toBe("price_changed");
      expect(w.bookings.size).toBe(0);
    }
  });

  it("keeps a fixed coupon before VAT (9729 case)", async () => {
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 9000 }] });
    const w = world(p, {
      reprice: () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: 9000, eligible: true }] }),
      evaluateCoupon: async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 }),
    });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN" }), w.d as never);
    // fare 100.00 - 10.00 = 90.00, plus 8.1 % VAT = 97.29
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(9729);
  });

  it("uses the Zurich instant for the manage-link expiry (D-36)", async () => {
    const p = payload();
    const w = world(p);
    let expiry = "";
    const base = w.d.createBooking;
    w.d.createBooking = async (a) => {
      expiry = a.manageTokenExpiresAt.toISOString();
      return base(a);
    };
    await runCheckoutIntent(await webBody(p), w.d as never);
    // 2026-09-06 10:00 Zurich (CEST, UTC+2) = 08:00Z, plus 1800 s
    expect(expiry).toBe("2026-09-06T08:30:00.000Z");
  });

  it("Pay again with the same selection returns the same booking and open url without createBooking", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never);
    const again = (await res.json()) as Record<string, unknown>;
    expect(again.reference).toBe(first.reference);
    expect(again.booking_id).toBe(first.booking_id);
    expect(again.url).toBe(first.url);
    expect(w.calls).not.toContain("createBooking");
    expect(w.bookings.size).toBe(1);
    expect(res.headers.get("set-cookie")).toMatch(/^vt_manage=/);
  });

  it("an expired session on a still-pending booking gets a new hosted session on the same booking", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.sessions.get("cs_1")!.status = "expired";
    const again = (await (await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never)).json()) as Record<string, unknown>;
    expect(again.reference).toBe(first.reference);
    expect(again.url).not.toBe(first.url);
    expect(w.calls).toContain("attach");
    expect(w.bookings.size).toBe(1);
  });

  it("a changed selection on the same quote expires every old session, confirms, purges as superseded, creates anew", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    const res = await runCheckoutIntent(
      await webBody(p, { extra_codes: ["child_seat"], idempotency_key: "idem-w2" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    const next = (await res.json()) as Record<string, unknown>;
    expect(next.booking_id).not.toBe(first.booking_id);
    const order = w.calls.join(" ");
    expect(order.indexOf("expire:cs_1")).toBeLessThan(order.indexOf(`purge:${first.booking_id}:superseded`));
    expect(order.indexOf(`purge:${first.booking_id}:superseded`)).toBeLessThan(order.indexOf("createBooking"));
    expect(w.bookings.size).toBe(1);
  });

  it("an old session that is complete refuses quote_already_booked and never purges", async () => {
    const p = payload();
    const w = world(p);
    await runCheckoutIntent(await webBody(p), w.d as never);
    const s = w.sessions.get("cs_1")!;
    s.status = "complete";
    s.payment_status = "paid";
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["ski_bag"], idempotency_key: "idem-w2" }), w.d as never);
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(1);
  });

  it("new quote_id + supersedes → same single row (owner only)", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    const p2 = payload({ quote_id: NEW_QUOTE });
    w.d.ownsBooking = async (id) => id === first.booking_id;
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    expect(w.calls).toContain(`purge:${first.booking_id}:superseded`);
    expect(w.bookings.size).toBe(1);
    expect([...w.bookings.values()][0]!.quote).toBe(NEW_QUOTE);
  });

  it("supersedes for a booking the cookie does not own purges nothing", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    const p2 = payload({ quote_id: NEW_QUOTE });
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(2);
  });

  it("supersedes where an old session is complete refuses and leaves one row", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.sessions.get("cs_1")!.status = "complete";
    w.d.ownsBooking = async () => true;
    const p2 = payload({ quote_id: NEW_QUOTE });
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(1);
  });

  it("pay_link mode (no mode) still takes the old three-code body", async () => {
    const p = payload();
    const body = await bodyFor(p);
    const res = await runCheckoutIntent(body, deps(p));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { client_secret?: string }).client_secret).toBe("cs_test_1_secret");
  });
});
