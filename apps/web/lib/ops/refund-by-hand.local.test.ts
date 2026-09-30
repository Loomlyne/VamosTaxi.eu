// apps/web/lib/ops/refund-by-hand.local.test.ts
//
// 20-10 refunds by hand, end to end on a real local database through the REAL Worker client
// (asSystem / asStaff, `fetch_types: false`, login `vamos_edge` then the role). Only Stripe and the
// mail are replaced. Covers the Worker <-> database contract: staff cancel (no Stripe call, "Refund
// due", one mail), plan -> sent -> settle with int8 answered as strings, SQL errors raised by the
// database and mapped by mapRefundSqlError, and a Retry after a Stripe refusal (the staff read of
// last_error, then the bumped idempotency key). Skipped unless VAMOS_LOCAL_DB_PORT names a
// DISPOSABLE local stack; synthetic rappen only; rows are committed, use a scratch stack.
// Host is fixed to 127.0.0.1.
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createRefund = vi.fn();
const notifyCancellation = vi.fn();
/** refunds "at Stripe": what createRefund made, found again by findRefundByIntent. */
const atStripe: { id: string; intent: string; status: string }[] = [];

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    expireCheckoutSession: vi.fn(),
    resolvePaymentIntentId: async (_s: unknown, id: string) => id,
    retrieveRefund: async (_s: unknown, id: string) => ({ id, status: "succeeded" }),
    findRefundByIntent: async (_s: unknown, _pi: string, intent: number | string) =>
      atStripe.find((r) => r.intent === String(intent) && r.status !== "failed" && r.status !== "canceled") ?? null,
    createRefund: (...a: unknown[]) => createRefund(...a),
  };
});
vi.mock("../lifecycle/notify-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lifecycle/notify-lifecycle")>();
  return { ...actual, notifyCancellation: (...a: unknown[]) => notifyCancellation(...a) };
});

describe.skipIf(!PORT)("refunds by hand through the real Worker client (local, committed rows)", () => {
  const env = {
    HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    STRIPE_SECRET_KEY: "sk_test_local",
  } as unknown as CloudflareEnv;
  const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  const adminId = `${tag}-0000-4000-a000-000000000001`;
  const claims = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;
  let su!: postgres.Sql; // opened inside the test: a skipped describe still runs its body
  const book: Record<string, { id: string; reference: string; pays: number[] }> = {};

  async function makeBooking(key: string, hoursAhead: number, amounts: number[]) {
    await su.begin(async (tx) => {
      await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
               values (${`rh-${tag}`}, 3, 3) on conflict (slug) do nothing`;
      const [b] = await tx<{ id: string; reference: string }[]>`
        insert into public.bookings (contact_name, contact_email, status)
        values (${`RH ${key}`}, ${`rh-${tag}-${key}@example.test`}, 'paid') returning id, reference`;
      await tx`
        insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                         scheduled_at, scheduled_local, vehicle_class_id, status)
        select ${b!.id}, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
               now() + make_interval(hours => ${hoursAhead}::int),
               to_char(now() + make_interval(hours => ${hoursAhead}::int), 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
          from public.vehicle_classes vc where vc.slug = ${`rh-${tag}`}`;
      await tx`set local session_replication_role = replica`;
      const pays: number[] = [];
      let i = 0;
      for (const amount of amounts) {
        i += 1;
        const [snap] = await tx<{ id: string }[]>`
          insert into public.price_snapshots (
            quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
            engine_version, pax, bags, lines, policy,
            subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
            expires_at, quote_lock_expires_at, booking_id)
          select gen_random_uuid(), vc.id, rv.id, false, sv.id, ${`quote-engine@rh-${tag}-${key}-${i}`},
                 2, 2, '[]'::jsonb,
                 jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                   'airport_waiting_minutes', 60, 'city_waiting_minutes', 15, 'settings_version_id', sv.id,
                   'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'rh'),
                 ${amount}, 0, 0, ${amount}, now() + interval '1 day', now() + interval '1 day', ${b!.id}
            from public.vehicle_classes vc
            cross join lateral (select id from public.rate_versions order by id limit 1) rv
            cross join lateral (select id from public.settings_versions order by id limit 1) sv
           where vc.slug = ${`rh-${tag}`} returning id`;
        const [p] = await tx<{ id: string }[]>`
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values (${b!.id}, ${snap!.id}, ${`pi_rh_${tag}_${key}_${i}`}, ${amount}, 'succeeded', now()) returning id`;
        pays.push(Number(p!.id));
      }
      await tx`update public.bookings set price_snapshot_id = (select min(id) from public.price_snapshots where booking_id = ${b!.id})
                where id = ${b!.id}`;
      book[key] = { id: b!.id, reference: b!.reference, pays };
    });
  }

  const row = async (key: string) =>
    (
      await su<{ refund_status: string; owed: string | null; refunded: string | null; status: string }[]>`
        select refund_status::text, refund_owed_rappen::text as owed, refunded_rappen::text as refunded, status::text
          from public.bookings where id = ${book[key]!.id}`
    )[0]!;

  beforeEach(() => {
    createRefund.mockReset();
    notifyCancellation.mockReset();
    atStripe.length = 0;
    createRefund.mockImplementation(async (_s: unknown, input: { idempotencyKey: string; metadata: { vamos_intent: string } }) => {
      const r = { id: `re_${tag}_${atStripe.length + 1}`, status: "succeeded" };
      atStripe.push({ id: r.id, intent: input.metadata.vamos_intent, status: r.status });
      return r;
    });
  });

  it("staff cancel, refund across two payments, SQL errors, and Retry after a refusal", async () => {
    su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    try {
      await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
               values (${adminId}, ${`rh-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
      await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'RH Admin')`;
      await makeBooking("far", 30, [10000, 2000]);
      await makeBooking("near", 3, [8000]);

      const { cancelBooking } = await import("./bookings-write");
      const { refundBooking } = await import("./refund");
      const { mapRefundSqlError } = await import("./refund-map");
      const { asSystem } = await import("../db/identity");

      // B1 on a real database: a staff cancel of a paid booking makes no Stripe call, leaves "Refund due",
      // and the customer gets one cancellation mail.
      const cancelled = await cancelBooking(env, claims, book["far"]!.reference);
      expect(cancelled.ok).toBe(true);
      expect(createRefund).not.toHaveBeenCalled();
      expect(notifyCancellation).toHaveBeenCalledTimes(1);
      expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({ refundLine: "full_captured" });
      expect(await row("far")).toMatchObject({ status: "cancelled", refund_status: "pending_ops", owed: "12000", refunded: "0" });

      // The full-tier rule, raised by SQL and mapped by the Worker's mapper.
      const sqlRefused = await asSystem(env, (sql) =>
        sql`select * from public.ops_refund_plan(${book["far"]!.id}::uuid, ${adminId}::uuid, null::int8, 50::numeric, null::text, false::bool, null::int)`,
      ).then(
        () => null,
        (err: unknown) => mapRefundSqlError(err),
      );
      expect(sqlRefused).toEqual({ ok: false, code: "full-refund-only" });
      // ...and by the Worker before SQL.
      expect(await refundBooking(env, claims, book["far"]!.reference, { percent: 50 })).toEqual({ ok: false, code: "full-refund-only" });

      // Plan -> Stripe -> sent -> settle for both payments.
      const done = await refundBooking(env, claims, book["far"]!.reference, {});
      expect(done).toMatchObject({ ok: true, refundedRappen: 12000, dueRappen: 0, refundStatus: "refunded" });
      expect(createRefund).toHaveBeenCalledTimes(2);
      expect(createRefund.mock.calls.map((c) => (c[1] as { amountRappen: number }).amountRappen)).toEqual([10000, 2000]);
      expect(await row("far")).toMatchObject({ refund_status: "refunded", refunded: "12000" });
      expect(await refundBooking(env, claims, book["far"]!.reference, {})).toMatchObject({ ok: false, code: "already-refunded" });

      // refund-exceeds-remaining, raised by SQL (the inside-24 h booking: the review tier takes an exact amount).
      await cancelBooking(env, claims, book["near"]!.reference);
      expect(await row("near")).toMatchObject({ refund_status: "pending_ops", owed: null });
      const tooMuch = await asSystem(env, (sql) =>
        sql`select * from public.ops_refund_plan(${book["near"]!.id}::uuid, ${adminId}::uuid, ${book["near"]!.pays[0]!}::int8, null::numeric, null::text, false::bool, 9000::int)`,
      ).then(
        () => null,
        (err: unknown) => mapRefundSqlError(err),
      );
      expect(tooMuch).toEqual({ ok: false, code: "refund-exceeds-remaining" });

      // B2: Stripe refuses; the error is stored with "stripe:"; Retry reads it as staff and bumps the key.
      createRefund.mockReset();
      createRefund.mockRejectedValueOnce(Object.assign(new Error("balance too low"), { statusCode: 400, code: "balance_insufficient" }));
      const refused = await refundBooking(env, claims, book["near"]!.reference, { percent: 100 });
      expect(refused).toMatchObject({ ok: false, code: "stripe-failed" });
      const [intent] = await su<{ id: string; attempts: number; last_error: string; state: string }[]>`
        select id::text, attempts, last_error, state::text from public.booking_refund_intents where booking_id = ${book["near"]!.id}`;
      expect(intent).toMatchObject({ attempts: 1, state: "failed" });
      expect(intent!.last_error).toMatch(/^stripe: balance too low/);
      createRefund.mockImplementation(async (_s: unknown, input: { metadata: { vamos_intent: string } }) => {
        atStripe.push({ id: "re_retry", intent: input.metadata.vamos_intent, status: "succeeded" });
        return { id: "re_retry", status: "succeeded" };
      });
      const retried = await refundBooking(env, claims, book["near"]!.reference, { retry: true });
      expect(retried).toMatchObject({ ok: true, dueRappen: 0 });
      expect(createRefund).toHaveBeenCalledTimes(2);
      expect(createRefund.mock.calls[1]![1]).toMatchObject({ idempotencyKey: `refund-intent:${intent!.id}:1` });
      expect(await row("near")).toMatchObject({ refund_status: "refunded", refunded: "8000" });
    } finally {
      await su.end({ timeout: 5 });
    }
  });
});
