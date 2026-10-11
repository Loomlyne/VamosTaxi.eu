// packages/db/test/local/coupon-race.test.ts
//
// Phase 4 QUOTE-06 / GAP-1 (04-VALIDATION.md): two payers race for the last use of a coupon with
// global_limit = 1. Exactly one wins, the other gets the coupon refusal (restrict_violation 23001,
// 'coupon global limit reached', raised by tg_coupon_redemption_caps), and exactly one
// coupon_redemptions row exists. pgTAP runs in one session, so this needs two real connections.
//
// Two levels, both with fresh coupons per round:
//   1. The entry point the Worker calls: apps/web createBooking -> public.checkout_create_booking,
//      as role vamos_checkout through withIdentity, on two connections with the Worker's options.
//      Note: every checkout_create_booking also upserts the per-year row of
//      booking_reference_counters (next_booking_reference, step 3) and holds that row lock until
//      commit, so two checkouts are already single-file before the coupon insert (step 7). That lock
//      alone would hide a missing coupon lock here, which is why level 2 exists.
//   2. The trigger itself: two transactions insert coupon_redemptions for two pre-built bookings
//      (bound live snapshot + requires_payment payment, the coupon_evaluate.test.sql shape) with no
//      other shared row. Only the `select ... from coupons ... for update` in
//      tg_coupon_redemption_caps can serialise them. Without it, under READ COMMITTED the second
//      session counts 0 unreleased redemptions (the first row is not committed yet), both inserts
//      pass, two rows exist and the deterministic case below sees no lock wait.
//
// Committed fixtures (a rolled-back transaction is invisible to the other connection), not removed:
// bookings are append-only; the lab or `pnpm test:db-lab` resets the stack before each run. Synthetic
// integer rappen only (D-46), never a CHF figure. Local only: host 127.0.0.1, port
// VAMOS_LOCAL_DB_PORT (a throwaway lab stack, never another session's).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withIdentity } from "../../src/identity.js";
import { workerSql } from "../support/worker-client.js";
import { createBooking } from "../../../../apps/web/lib/checkout/create-booking.js";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"] ?? "62322";
const SUPER = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const ROUNDS = 6;
const T = { timeout: 60_000 };
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Sql = ReturnType<typeof workerSql>;
type Failure = { error: string; message: string; detail?: string; where?: string };
type Fx = { classId: string; rateVersionId: number; settingsVersionId: number };

let admin: Sql;
let fx: Fx;

function isFailure(v: unknown): v is Failure {
  return typeof v === "object" && v !== null && "error" in v;
}

/** The value, or the SQLSTATE and message it failed with. */
async function outcome<T>(p: Promise<T>): Promise<T | Failure> {
  return p.then(
    (v) => v,
    (e: unknown) => ({
      error: (e as { code?: string }).code ?? String(e),
      message: (e as { message?: string }).message ?? "",
      detail: (e as { detail?: string }).detail,
      where: (e as { where?: string }).where,
    }),
  );
}

/** A promise both sides await, so both transactions are open before either fires. */
function barrier(n: number): () => Promise<void> {
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((res) => (release = res));
  return () => {
    count += 1;
    if (count === n) release();
    return gate;
  };
}

async function backendPid(tx: { <R>(s: TemplateStringsArray, ...v: unknown[]): Promise<R> } | Sql): Promise<number> {
  const rows = (await (tx as Sql)`select pg_backend_pid() as pid`) as unknown as { pid: number }[];
  return rows[0]!.pid;
}

/** Polls until `pid` waits on a lock; returns the table of the row it waits for. Throws after `ms`. */
async function waitingOnTable(pid: () => number | undefined, ms = 3000): Promise<string> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const p = pid();
    if (p !== undefined) {
      const rows = await admin<{ wait: string | null; rel: string | null }[]>`
        select a.wait_event_type as wait,
               coalesce(
                 (select l.relation::regclass::text from pg_locks l
                   where l.pid = a.pid and l.locktype = 'tuple' and l.granted limit 1),
                 (select l.relation::regclass::text from pg_locks l
                   where l.pid = a.pid and l.locktype = 'relation' and not l.granted limit 1)) as rel
          from pg_stat_activity a where a.pid = ${p}::int4`;
      const r = rows[0];
      if (r && r.wait === "Lock" && r.rel) return r.rel;
    }
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`backend ${String(pid())} never waited on a lock`);
}

/** A fresh single-use coupon on the live book. */
async function newCoupon(tag: string): Promise<{ id: number; code: string }> {
  const code = `RACE-${RUN}-${tag}`.toUpperCase();
  const rows = await admin<{ id: string }[]>`
    insert into public.coupons (code, kind, percent, global_limit, active, rate_version_id)
    values (${code}, 'percent', 10.00, 1, true, ${fx.rateVersionId}::int8)
    returning id::text as id`;
  return { id: Number(rows[0]!.id), code };
}

async function redemptions(couponId: number): Promise<{ booking_id: string }[]> {
  return admin<{ booking_id: string }[]>`
    select booking_id::text as booking_id from public.coupon_redemptions
     where coupon_id = ${couponId}::int8 and released_at is null`;
}

const POLICY = () => ({
  cancellation_tiers: [],
  free_cancel_hours: 24,
  airport_waiting_minutes: 60,
  city_waiting_minutes: 15,
  settings_version_id: fx.settingsVersionId,
  modification_deadline_hours: 24,
  min_advance_minutes: 180,
  policy_doc: "coupon-race",
});
const LINES = [{ seq: 1, code: "distance_fare", kind: "fare", i18n_key: "price.line.distance", amount_rappen: 6 }];

type BookingArgs = Parameters<typeof createBooking>[1];

/** The arguments the Worker's Pay handler passes to createBooking, for one synthetic payer. */
function bookingArgs(tag: string, coupon: { id: number; code: string }): BookingArgs {
  const at = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  return {
    quoteId: crypto.randomUUID(),
    idempotencyKey: `race-${RUN}-${tag}`,
    contact: { name: `Race ${tag}`, email: `race-${RUN}-${tag}@example.test`, phone: "+41000000000" },
    locale: "en",
    displayCurrency: "CHF",
    snapshot: {
      vehicle_class_id: fx.classId,
      rate_version_id: fx.rateVersionId,
      settings_version_id: fx.settingsVersionId,
      engine_version: "quote-engine@coupon-race",
      lock_exp: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      pax: 1,
      bags: 0,
      lines: LINES,
      policy: POLICY(),
      shown_alternatives: [],
      display_currency: "CHF",
      source: "web",
      subtotal_rappen: 6,
      surcharges_rappen: 0,
      discount_rappen: 0,
      total_rappen: 6,
      distance_km: 12.5,
      duration_min: 25,
    },
    legs: [
      {
        leg_seq: 1,
        direction: "outbound",
        pickup_text: "ZRH Airport",
        pickup_lat: 47.458056,
        pickup_lng: 8.549167,
        dropoff_text: "Zurich HB",
        dropoff_lat: 47.378177,
        dropoff_lng: 8.540192,
        scheduled_at: at.toISOString(),
        scheduled_local: at.toISOString().slice(0, 16),
        vehicle_class_id: fx.classId,
        pax: 1,
        bags: 0,
        estimated_duration_minutes: 25,
        duration_min: 25,
        distance_km: 12.5,
        leg_subtotal_rappen: 6,
      },
    ],
    couponId: coupon.id,
    couponCode: coupon.code,
    manageTokenHash: crypto.getRandomValues(new Uint8Array(32)),
    manageTokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    stripePaymentIntentId: `pi_race_${RUN}_${tag}`,
    stripeCheckoutSessionId: `cs_race_${RUN}_${tag}`,
    chargedRappen: 6,
    actorCustomerId: null,
  };
}

/** One checkout write exactly as the Worker issues it: createBooking as vamos_checkout. */
function checkout(client: Sql, tag: string, coupon: { id: number; code: string }, onOpen?: (pid: number) => Promise<void>) {
  return withIdentity(
    SUPER,
    "checkout",
    null,
    async (tx) => {
      if (onOpen) await onOpen(await backendPid(tx as never));
      return createBooking(tx, bookingArgs(tag, coupon));
    },
    { client },
  );
}

/** A pending booking with a bound live snapshot and a requires_payment row (coupon_evaluate.test.sql shape). */
async function fixturePayment(tag: string): Promise<{ bookingId: string; paymentId: number }> {
  return admin.begin(async (tx) => {
    const [b] = await tx<{ id: string }[]>`
      insert into public.bookings (contact_name, contact_email)
      values (${`Race ${tag}`}, ${`race-fx-${RUN}-${tag}@example.test`})
      returning id::text as id`;
    const [s] = await tx<{ id: string }[]>`
      insert into public.price_snapshots (
        quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
        engine_version, pax, bags, lines, policy, booking_id,
        subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at)
      values (
        gen_random_uuid(), ${fx.classId}::uuid, ${fx.rateVersionId}::int8, true, ${fx.settingsVersionId}::int8,
        ${`quote-engine@race-${tag}`}, 1, 0,
        convert_from(decode(${hex(LINES)}, 'hex'), 'utf8')::jsonb,
        convert_from(decode(${hex(POLICY())}, 'hex'), 'utf8')::jsonb,
        ${b!.id}::uuid, 6, 0, 0, 6, now() + interval '30 minutes', now() + interval '30 minutes')
      returning id::text as id`;
    await tx`update public.bookings set price_snapshot_id = ${s!.id}::int8 where id = ${b!.id}::uuid`;
    const [p] = await tx<{ id: string }[]>`
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status)
      values (${b!.id}::uuid, ${s!.id}::int8, ${`pi_race_fx_${RUN}_${tag}`}, 6, 'requires_payment')
      returning id::text as id`;
    return { bookingId: b!.id, paymentId: Number(p!.id) };
  });
}

function hex(value: unknown): string {
  return Array.from(new TextEncoder().encode(JSON.stringify(value)), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** One coupon_redemptions insert in its own transaction, held open `holdMs` after the insert. */
function redeem(client: Sql, couponId: number, pay: { bookingId: string; paymentId: number }, holdMs: number, onOpen?: (pid: number) => Promise<void>) {
  return client.begin(async (tx) => {
    if (onOpen) await onOpen(await backendPid(tx as never));
    await tx`
      insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
      values (${couponId}::int8, ${pay.bookingId}::uuid, ${pay.paymentId}::int8)`;
    if (holdMs > 0) await tx`select pg_sleep(${holdMs / 1000})`;
    return "redeemed" as const;
  });
}

function expectCouponRefusal(v: unknown, label = ""): void {
  expect(isFailure(v), label).toBe(true);
  expect((v as Failure).error, `${label} ${JSON.stringify(v)}`).toBe("23001");
  expect((v as Failure).message, label).toBe("coupon global limit reached");
}

beforeAll(async () => {
  expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  admin = workerSql(SUPER, "identity");
  const live = await admin<{ id: string }[]>`
    select id::text as id from public.rate_versions where status = 'live' order by id desc limit 1`;
  if (live.length !== 1) throw new Error("coupon-race: no live rate version on this stack (run on a seeded lab)");
  const cls = await admin<{ id: string }[]>`select id::text as id from public.vehicle_classes order by slug limit 1`;
  const sv = await admin<{ id: string }[]>`
    select id::text as id from public.settings_versions where checkout_window_minutes is not null order by id desc limit 1`;
  fx = { classId: cls[0]!.id, rateVersionId: Number(live[0]!.id), settingsVersionId: Number(sv[0]!.id) };
});

afterAll(async () => {
  await admin?.end({ timeout: 5 });
});

describe("coupon global_limit = 1 under two parallel payers (QUOTE-06, GAP-1)", () => {
  it("refuses any host but 127.0.0.1", () => {
    expect(new URL(SUPER).hostname).toBe("127.0.0.1");
  });

  it("(a) trigger, deterministic: the second redemption waits on the coupons row, then is refused", T, async () => {
    const a = workerSql(SUPER, "identity");
    const b = workerSql(SUPER, "identity");
    try {
      const coupon = await newCoupon("det-trigger");
      const payA = await fixturePayment("det-a");
      const payB = await fixturePayment("det-b");
      let bPid: number | undefined;
      let bP: Promise<"redeemed"> | undefined;
      const aOut = await a.begin(async (tx) => {
        await tx`
          insert into public.coupon_redemptions (coupon_id, booking_id, payment_id)
          values (${coupon.id}::int8, ${payA.bookingId}::uuid, ${payA.paymentId}::int8)`;
        bP = redeem(b, coupon.id, payB, 0, async (pid) => {
          bPid = pid;
        });
        // B must block on A's coupon row lock while A is still open.
        return { waitsOn: await waitingOnTable(() => bPid) };
      });
      const bOut = await outcome(bP!);
      expect(aOut.waitsOn).toBe("coupons");
      expectCouponRefusal(bOut);
      const rows = await redemptions(coupon.id);
      expect(rows).toEqual([{ booking_id: payA.bookingId }]);
    } finally {
      await Promise.all([a.end({ timeout: 5 }), b.end({ timeout: 5 })]);
    }
  });

  it(`(b) trigger, ${ROUNDS} parallel rounds: one redemption, one coupon refusal, one row`, T, async () => {
    const a = workerSql(SUPER, "identity");
    const b = workerSql(SUPER, "identity");
    try {
      const payA = await fixturePayment("par-a");
      const payB = await fixturePayment("par-b");
      for (let i = 0; i < ROUNDS; i++) {
        const coupon = await newCoupon(`par-trigger-${i}`);
        const go = barrier(2);
        // Each side holds its transaction 300 ms after the insert: without the coupon lock both
        // inserts would land inside that window and both commit.
        const results = await Promise.all([
          outcome(redeem(a, coupon.id, payA, 300, () => go())),
          outcome(redeem(b, coupon.id, payB, 300, () => go())),
        ]);
        const won = results.filter((r) => r === "redeemed");
        const lost = results.filter(isFailure);
        expect(won, `round ${i}: ${JSON.stringify(results)}`).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expectCouponRefusal(lost[0]);
        expect(await redemptions(coupon.id), `round ${i}`).toHaveLength(1);
      }
    } finally {
      await Promise.all([a.end({ timeout: 5 }), b.end({ timeout: 5 })]);
    }
  });

  it("(c) checkout entry point, deterministic: the second payer waits, then gets the coupon refusal and no booking", T, async () => {
    const a = workerSql(SUPER, "identity");
    const b = workerSql(SUPER, "identity");
    try {
      const coupon = await newCoupon("det-checkout");
      let bPid: number | undefined;
      let bP: ReturnType<typeof checkout> | undefined;
      let waitsOn = "";
      const aRow = await withIdentity(
        SUPER,
        "checkout",
        null,
        async (tx) => {
          const row = await createBooking(tx, bookingArgs("det-a", coupon));
          bP = checkout(b, "det-b", coupon, async (pid) => {
            bPid = pid;
          });
          waitsOn = await waitingOnTable(() => bPid);
          return row;
        },
        { client: a },
      );
      const bOut = await outcome(bP!);
      // Either lock is a correct serialiser; today it is the reference counter (see header).
      expect(["booking_reference_counters", "coupons"]).toContain(waitsOn);
      expectCouponRefusal(bOut);
      expect(await redemptions(coupon.id)).toEqual([{ booking_id: aRow.booking_id }]);
      const loser = await admin<{ n: number }[]>`
        select count(*)::int4 as n from public.bookings where idempotency_key = ${`race-${RUN}-det-b`}`;
      expect(loser[0]!.n).toBe(0);
    } finally {
      await Promise.all([a.end({ timeout: 5 }), b.end({ timeout: 5 })]);
    }
  });

  it(`(d) checkout entry point, ${ROUNDS} parallel rounds: one booking with the coupon, one coupon refusal, one row`, T, async () => {
    const a = workerSql(SUPER, "identity");
    const b = workerSql(SUPER, "identity");
    try {
      for (let i = 0; i < ROUNDS; i++) {
        const coupon = await newCoupon(`par-checkout-${i}`);
        const go = barrier(2);
        const results = await Promise.all([
          outcome(checkout(a, `par-${i}-a`, coupon, () => go())),
          outcome(checkout(b, `par-${i}-b`, coupon, () => go())),
        ]);
        const won = results.filter((r) => !isFailure(r)) as Awaited<ReturnType<typeof checkout>>[];
        const lost = results.filter(isFailure);
        expect(won, `round ${i}: ${JSON.stringify(results)}`).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expectCouponRefusal(lost[0], `round ${i}`);
        expect(await redemptions(coupon.id)).toEqual([{ booking_id: won[0]!.booking_id }]);
        const bookings = await admin<{ n: number }[]>`
          select count(*)::int4 as n from public.bookings
           where idempotency_key in (${`race-${RUN}-par-${i}-a`}, ${`race-${RUN}-par-${i}-b`})`;
        expect(bookings[0]!.n, `round ${i}: the loser's booking rolled back`).toBe(1);
      }
    } finally {
      await Promise.all([a.end({ timeout: 5 }), b.end({ timeout: 5 })]);
    }
  });
});
