// apps/web/lib/checkout/refund-mail.local.test.ts
//
// Phase 31-05 (D-10): the customer refund mail's claim, dedupe and retry through the REAL Worker client
// (asSystem: login `vamos_edge`, role vamos_system, `fetch_types: false`, prepared statements) on the
// migration 20261012220000 definers: notification_claim_refund writes one booking_notifications row kind
// 'refund' (dedupe booking:refund:<re_id>), a second claim writes nothing and sends nothing, a failed send
// stays on the claim, notification_sweep('0 seconds', ['refund']) hands it back and the sweep's refund route
// re-sends it with the refund_rappen recorded from Stripe. Resend and the info@ alert are stand-ins.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the phase lab). The fixture rows are
// committed and stay; every id carries a random tag (never a fixed id, so other plans' local tests can run
// on the same lab). Host is fixed to 127.0.0.1. Synthetic rappen integers only, never a product CHF figure.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { notificationSweepStuck, sweepStuckNotificationsWithDeps } from "./notify";
import {
  deliverRefundMailByClaimWithDeps,
  mailCustomerRefundWithDeps,
  refundMailDeps,
  type RefundMailDeps,
  type RefundMailSend,
} from "./refund-mail";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

type NotificationRow = {
  id: string;
  kind: string;
  locale: string;
  sent_at: Date | null;
  failed_at: Date | null;
  error: string | null;
  provider_message_id: string | null;
};

describe.skipIf(!PORT)("customer refund mail: claim, dedupe and sweep retry through the Worker client (local)", () => {
  let owner!: ReturnType<typeof workerSql>;
  let bookingId = "";
  const email = `rml-${tag}@vamostaxi.eu`;
  const reSent = `re_rml_${tag}_sent`;
  const reRetry = `re_rml_${tag}_retry`;

  beforeAll(async () => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    await owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      const booking = await tx<{ id: string }[]>`
        insert into public.bookings (reference, contact_name, contact_email, status, locale)
        values (public.next_booking_reference(), ${`RML ${tag}`}, ${email}, 'confirmed', 'de')
        returning id`;
      bookingId = booking[0]!.id;
      await tx`
        insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                         scheduled_at, scheduled_local, vehicle_class_id, status)
        select ${bookingId}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
               now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
               (select id from public.vehicle_classes order by id limit 1), 'pending'`;
      const snap = await tx<{ id: string }[]>`
        insert into public.price_snapshots (
          quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
          engine_version, pax, bags, lines, policy,
          subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
          expires_at, quote_lock_expires_at, booking_id, source
        )
        select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@rml', 1, 1,
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
        values (${bookingId}::uuid, ${snapshotId}::int8, ${`pi_rml_${tag}`}, 10000, 'CHF', 'succeeded', now())
        returning id`;
      // Two refunds Stripe made and stripe_charge_refunded_record recorded ('recorded').
      await tx`
        insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                            refund_rappen, tier_applied, hours_before, stripe_refund_id)
        values (${bookingId}::uuid, ${snapshotId}::int8, ${payment[0]!.id}::int8, 'stripe_dashboard', 1234, 100,
                1234, '{}'::jsonb, 0, ${reSent}),
               (${bookingId}::uuid, ${snapshotId}::int8, ${payment[0]!.id}::int8, 'stripe_dashboard', 567, 100,
                567, '{}'::jsonb, 0, ${reRetry})`;
    });
  });

  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });

  const claimsOf = async (stripeRefundId: string): Promise<NotificationRow[]> =>
    owner<NotificationRow[]>`
      select id::text as id, kind, locale, sent_at, failed_at, error, provider_message_id
        from public.booking_notifications
       where dedupe_key = ${`booking:refund:${stripeRefundId}`}`;

  const recordedRappen = async (stripeRefundId: string): Promise<number> => {
    const rows = await owner<{ r: number }[]>`
      select refund_rappen::int4 as r from public.booking_refunds where stripe_refund_id = ${stripeRefundId}`;
    return rows[0]!.r;
  };

  /** The real claim, read and settle (asSystem through the Worker client); send, alert and logs are stand-ins. */
  function deps(send: RefundMailDeps["send"]) {
    const alert = vi.fn(async () => true);
    const emit = vi.fn();
    const sendFn = vi.fn(send);
    const d: RefundMailDeps = { ...refundMailDeps(env), send: sendFn, alert, emit };
    return { d, send: sendFn, alert, emit };
  }

  it("claims once, sends with Stripe's amount in the booking's language, settles sent; a replay sends nothing", async () => {
    const ok = deps(async () => ({ ok: true, providerMessageId: `msg_rml_${tag}` }));
    await mailCustomerRefundWithDeps(ok.d, { bookingId, stripeRefundId: reSent, refundRappen: 1234 });

    const rows = await claimsOf(reSent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "refund", locale: "de", error: null, provider_message_id: `msg_rml_${tag}` });
    expect(rows[0]!.sent_at).not.toBeNull();
    expect(ok.send).toHaveBeenCalledTimes(1);
    const sent = ok.send.mock.calls[0]![0] as RefundMailSend;
    expect(sent).toMatchObject({
      locale: "de",
      to: email,
      amountRappen: 1234,
      idempotencyKey: `refund-mail:${reSent}`,
    });

    // The same Stripe refund again (a second event, a replay): no second row, no second send.
    const again = deps(async () => ({ ok: true, providerMessageId: "msg_never" }));
    await mailCustomerRefundWithDeps(again.d, { bookingId, stripeRefundId: reSent, refundRappen: 1234 });
    expect(await claimsOf(reSent)).toHaveLength(1);
    expect(again.send).not.toHaveBeenCalled();

    expect(ok.alert).not.toHaveBeenCalled();
    expect(again.alert).not.toHaveBeenCalled();
    expect(ok.emit).not.toHaveBeenCalledWith("error", expect.anything(), expect.anything());
    expect(again.emit).not.toHaveBeenCalledWith("error", expect.anything(), expect.anything());
  });

  it("a failed send stays on the claim; the sweep hands it back and the refund route sends the recorded amount", async () => {
    const failing = deps(async () => ({ ok: false, error: "resend 500" }));
    await mailCustomerRefundWithDeps(failing.d, { bookingId, stripeRefundId: reRetry, refundRappen: 567 });
    let rows = await claimsOf(reRetry);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sent_at).toBeNull();
    expect(rows[0]!.failed_at).not.toBeNull();
    expect(rows[0]!.error).toBe("send_failed");
    const claimId = Number(rows[0]!.id);

    // The production sweep query through the Worker client (text[] kinds via sql.array, 1009).
    const stuck = await notificationSweepStuck(env, "0 seconds", ["refund"]);
    const ours = stuck.filter((row) => Number(row.id) === claimId);
    expect(ours).toHaveLength(1);
    expect(String(ours[0]!.kind)).toBe("refund");

    const retry = deps(async () => ({ ok: true, providerMessageId: `msg_rml_${tag}_retry` }));
    const deliver = vi.fn(async () => undefined);
    const missing = vi.fn(async () => []);
    await sweepStuckNotificationsWithDeps(
      {
        // Only this test's row: other plans may share the lab; their rows are not ours to send.
        stuck: async (interval, kinds) =>
          (await notificationSweepStuck(env, interval, kinds)).filter((row) => Number(row.id) === claimId),
        missing,
        deliver,
        deliverRefund: (id) => deliverRefundMailByClaimWithDeps(retry.d, id),
        emit: vi.fn(),
      },
      0,
      ["refund"],
    );

    expect(deliver).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
    expect(retry.send).toHaveBeenCalledTimes(1);
    const sent = retry.send.mock.calls[0]![0] as RefundMailSend;
    expect(sent.amountRappen).toBe(await recordedRappen(reRetry));
    expect(sent).toMatchObject({ locale: "de", to: email, idempotencyKey: `refund-mail:${reRetry}` });

    rows = await claimsOf(reRetry);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sent_at).not.toBeNull();
    expect(rows[0]!.provider_message_id).toBe(`msg_rml_${tag}_retry`);

    // Sent rows leave the sweep.
    const after = await notificationSweepStuck(env, "0 seconds", ["refund"]);
    expect(after.some((row) => Number(row.id) === claimId)).toBe(false);

    expect(failing.alert).not.toHaveBeenCalled();
    expect(retry.alert).not.toHaveBeenCalled();
  });
});
