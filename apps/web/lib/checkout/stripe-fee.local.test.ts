// apps/web/lib/checkout/stripe-fee.local.test.ts
//
// 20261007290000 through the REAL Worker client (asSystem: login `vamos_edge`, role vamos_system,
// `fetch_types: false`, prepared statements): the hourly sweep's two database calls list captured
// payments without a fee (a new one by its PaymentIntent, a 10-day-old one still stored by its Checkout
// Session id: the backfill), write each fee once, and the rows then leave the list. Stripe is a stand-in
// here (stripe-fee.test.ts covers the Stripe side).
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). The fixture rows
// are committed and stay; every id carries a random tag. Host is fixed to 127.0.0.1.
// Synthetic rappen integers only, never a product CHF figure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { stripeFeeDbDeps, sweepStripeFeesWithDeps, type StripeFeeRead } from "./stripe-fee";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

describe.skipIf(!PORT)("stripe fee sweep through the real Worker client (local, committed rows)", () => {
  let owner!: ReturnType<typeof workerSql>;
  const pi = `pi_sfl_${tag}`;
  const cs = `cs_test_sfl_${tag}`;

  /** One booking, its snapshot and one captured CHF payment storing `stripeId`, `ageHours` ago. */
  const captured = async (stripeId: string, ageHours: number, key: string) => {
    await owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const booking = await tx<{ id: string }[]>`
        insert into public.bookings (reference, contact_name, contact_email, status, locale)
        values (public.next_booking_reference(), ${`SFL ${tag} ${key}`}, ${`sfl-${tag}-${key}@vamostaxi.eu`}, 'confirmed', 'en')
        returning id`;
      const bookingId = booking[0]!.id;
      const snap = await tx<{ id: string }[]>`
        insert into public.price_snapshots (
          quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
          engine_version, pax, bags, lines, policy,
          subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
          expires_at, quote_lock_expires_at, booking_id, source
        )
        select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@sfl', 1, 1,
               jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                                                    'i18n_key', 'price.line.transfer', 'amount_rappen', 10000)),
               jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                                  'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                                  'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                                  'min_advance_minutes', 180, 'policy_doc', 'test'),
               10000, 0, 0, 10000, now() + interval '1 day', now() + interval '1 day', ${bookingId}::uuid, 'web'
          from (select id from public.vehicle_classes order by id limit 1) as vc,
               (select id from public.rate_versions order by id limit 1) as rv,
               (select id from public.settings_versions order by id limit 1) as sv
        returning id`;
      await tx`update public.bookings set price_snapshot_id = ${snap[0]!.id}::int8 where id = ${bookingId}::uuid`;
      await tx`
        insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen,
                                             charged_currency, status, captured_at)
        values (${bookingId}::uuid, ${snap[0]!.id}::int8, ${stripeId}, 10000, 'CHF', 'succeeded',
                now() - make_interval(hours => ${ageHours}::int4))`;
    });
  };

  beforeAll(async () => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    await captured(pi, 0, "new");
    await captured(cs, 240, "old");
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  const feeOf = async (stripeId: string): Promise<number | null> => {
    const rows = await owner<{ fee: number | null }[]>`
      select stripe_fee_rappen::int4 as fee from public.booking_payments where stripe_payment_intent_id = ${stripeId}`;
    return rows[0]?.fee ?? null;
  };

  it("lists both payments, records each fee once, then they leave the list", async () => {
    const db = stripeFeeDbDeps(env);
    const listed = await db.pending(100);
    expect(listed).toContain(pi);
    expect(listed).toContain(cs);

    const fees: Record<string, StripeFeeRead> = {
      [pi]: { kind: "fee", feeRappen: 271 },
      [cs]: { kind: "fee", feeRappen: 268 },
    };
    const result = await sweepStripeFeesWithDeps({
      pending: async () => [pi, cs],
      record: db.record,
      read: async (id) => fees[id] ?? { kind: "pending" },
    });
    expect(result).toMatchObject({ recorded: 2, failed: 0 });
    expect(await feeOf(pi)).toBe(271);
    expect(await feeOf(cs)).toBe(268);

    const after = await db.pending(100);
    expect(after).not.toContain(pi);
    expect(after).not.toContain(cs);
    expect(await db.record(pi, 272)).toBe(false);
    expect(await feeOf(pi)).toBe(271);
  });

  it("a refused value writes nothing and does not throw", async () => {
    const db = stripeFeeDbDeps(env);
    expect(await db.record(`pi_sfl_${tag}_none`, 271)).toBe(false);
    expect(await db.record(pi, 0)).toBe(false);
    expect(await db.record(`ch_sfl_${tag}`, 271)).toBe(false);
  });
});
