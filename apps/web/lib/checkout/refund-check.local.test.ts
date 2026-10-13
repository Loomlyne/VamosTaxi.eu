// apps/web/lib/checkout/refund-check.local.test.ts
//
// Phase 31 D-09 / C-02: the nightly refund check's database read through the REAL Worker client
// (asSystem: login `vamos_edge`, role vamos_system, `fetch_types: false`, prepared statements) on the
// migration 20261012240000 definer refund_check_read, with the Stripe list passed by sql.json. Stripe and
// the two mails are stand-ins (refund-check.test.ts covers them). Proves the classification on real rows and
// that the run writes nothing: the row counts of bookings, booking_payments, booking_refunds and
// booking_notifications are unchanged.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the phase lab). The fixture rows are
// committed and stay; every id carries a random tag (never a fixed id, so other plans' local tests can run
// on the same lab). Host is fixed to 127.0.0.1. Synthetic rappen integers only, never a product CHF figure.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { loadRefundCheckRows } from "../db/system-reads";
import { refundCheckWithDeps, type StripeRefundLite } from "./refund-check";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

const NOW = new Date();
const NOW_S = Math.floor(NOW.getTime() / 1000);

describe.skipIf(!PORT)("nightly refund check through the Worker client (local, read-only)", () => {
  let owner!: ReturnType<typeof workerSql>;
  let reference = "";
  const pi = `pi_rcl_${tag}`;
  const piNone = `pi_rcl_${tag}_none`;
  const reRecorded = `re_rcl_${tag}_rec`;
  const reReversed = `re_rcl_${tag}_rev`;
  const reAmount = `re_rcl_${tag}_amt`;
  const reMissing = `re_rcl_${tag}_miss`;
  const reUnlinked = `re_rcl_${tag}_unl`;

  beforeAll(async () => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    await owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const booking = await tx<{ id: string; reference: string }[]>`
        insert into public.bookings (reference, contact_name, contact_email, status, locale)
        values (public.next_booking_reference(), ${`RCL ${tag}`}, ${`rcl-${tag}@vamostaxi.eu`}, 'cancelled', 'en')
        returning id, reference`;
      const bookingId = booking[0]!.id;
      reference = booking[0]!.reference;
      const snap = await tx<{ id: string }[]>`
        insert into public.price_snapshots (
          quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
          engine_version, pax, bags, lines, policy,
          subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
          expires_at, quote_lock_expires_at, booking_id, source
        )
        select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@rcl', 1, 1,
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
      const snapshotId = snap[0]!.id;
      await tx`update public.bookings set price_snapshot_id = ${snapshotId}::int8 where id = ${bookingId}::uuid`;
      const payment = await tx<{ id: string }[]>`
        insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen,
                                             charged_currency, status, captured_at)
        values (${bookingId}::uuid, ${snapshotId}::int8, ${pi}, 10000, 'CHF', 'succeeded', now() - interval '1 day')
        returning id`;
      const paymentId = payment[0]!.id;
      // Three refunds the webhook recorded: one matching, one Stripe later failed (reversed), one whose
      // recorded amount differs from Stripe's.
      await tx`
        insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                            refund_rappen, tier_applied, hours_before, stripe_refund_id)
        values (${bookingId}::uuid, ${snapshotId}::int8, ${paymentId}::int8, 'stripe_dashboard', 1500, 100,
                1500, '{}'::jsonb, 0, ${reRecorded}),
               (${bookingId}::uuid, ${snapshotId}::int8, ${paymentId}::int8, 'stripe_dashboard', 700, 100,
                700, '{}'::jsonb, 0, ${reReversed}),
               (${bookingId}::uuid, ${snapshotId}::int8, ${paymentId}::int8, 'stripe_dashboard', 900, 100,
                900, '{}'::jsonb, 0, ${reAmount})`;
      await tx`
        insert into public.booking_refund_reversals (refund_id, booking_id, payment_id, stripe_refund_id, stripe_status,
                                                     failure_reason, reversed_rappen, stripe_created)
        select r.id, r.booking_id, r.payment_id, r.stripe_refund_id, 'failed', 'expired_or_canceled_card',
               r.refund_rappen, now()
          from public.booking_refunds r where r.stripe_refund_id = ${reReversed}`;
      // The booking's total equals its non-reversed rows (1500 + 900): no total finding.
      await tx`update public.bookings set refunded_rappen = 2400, refund_status = 'refunded' where id = ${bookingId}::uuid`;
    });
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  const counts = async () =>
    (
      await owner<{ b: string; p: string; r: string; n: string }[]>`
        select (select count(*) from public.bookings)::text as b,
               (select count(*) from public.booking_payments)::text as p,
               (select count(*) from public.booking_refunds)::text as r,
               (select count(*) from public.booking_notifications)::text as n`
    )[0]!;

  const stripeRefund = (id: string, amount: number, over: Partial<StripeRefundLite> = {}): StripeRefundLite => ({
    id,
    amount,
    currency: "chf",
    status: "succeeded",
    created: NOW_S - 2 * 3600,
    payment_intent: pi,
    metadata: {},
    ...over,
  });

  it("classifies recorded, reversed, amount-different, missing and unlinked refunds and writes nothing", async () => {
    const before = await counts();
    const sendAlert = vi.fn(async () => undefined);
    const sendDidNotRun = vi.fn(async () => undefined);
    const readSite = vi.fn((items: { id: string; payment_intent: string | null }[]) => loadRefundCheckRows(env, items));

    const result = await refundCheckWithDeps(
      {
        listRefunds: async () => ({
          refunds: [
            stripeRefund(reRecorded, 1500),
            stripeRefund(reReversed, 700, { status: "failed" }),
            stripeRefund(reAmount, 1000),
            stripeRefund(reMissing, 800),
            stripeRefund(reUnlinked, 300, { payment_intent: piNone }),
          ],
          truncated: false,
        }),
        readSite,
        sendAlert,
        sendDidNotRun,
        emit: vi.fn(),
      },
      NOW,
    );

    expect(result).toEqual({
      outcome: "ok",
      stripeRefunds: 5,
      compared: 5,
      skippedInFlight: 0,
      skippedAppMissing: 0,
      findings: 3,
      truncated: false,
      mailed: true,
    });
    expect(sendDidNotRun).not.toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]).toEqual([
      {
        missing: [
          { reference, amountRappen: 800, refundId: reMissing, createdAt: new Date((NOW_S - 2 * 3600) * 1000).toISOString() },
        ],
        amountDiffers: [{ reference, stripeRappen: 1000, siteRappen: 900, refundId: reAmount }],
        totalDiffers: [],
        statusDiffers: [],
        unlinked: [{ refundId: reUnlinked, amountRappen: 300, paymentIntentId: piNone }],
        truncated: false,
      },
    ]);

    // The reader answered one row per element, in input order, on the Worker client.
    const rows = await readSite.mock.results[0]!.value;
    expect(rows.map((r: { stripe_refund_id: string }) => r.stripe_refund_id)).toEqual([
      reRecorded,
      reReversed,
      reAmount,
      reMissing,
      reUnlinked,
    ]);
    expect(rows[1]).toMatchObject({ payment_found: true, site_reversed: true, booking_reference: reference });

    expect(await counts()).toEqual(before);
  });

  it("a booking whose refunded total differs from its rows is one total finding", async () => {
    await owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.bookings set refunded_rappen = 3100 where reference = ${reference}`;
    });
    const sendAlert = vi.fn(async () => undefined);
    const result = await refundCheckWithDeps(
      {
        listRefunds: async () => ({ refunds: [stripeRefund(reRecorded, 1500), stripeRefund(reAmount, 900)], truncated: false }),
        readSite: (items) => loadRefundCheckRows(env, items),
        sendAlert,
        sendDidNotRun: vi.fn(async () => undefined),
        emit: vi.fn(),
      },
      NOW,
    );
    expect(result.findings).toBe(1);
    expect(sendAlert.mock.calls[0]).toEqual([
      expect.objectContaining({ totalDiffers: [{ reference, bookingRappen: 3100, rowsRappen: 2400 }] }),
    ]);
  });
});
