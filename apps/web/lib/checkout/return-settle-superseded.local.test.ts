// apps/web/lib/checkout/return-settle-superseded.local.test.ts
//
// 261005 review follow-up (U15, both arrival orders of one paid checkout) on a real local database,
// through the REAL begin() of handleStripeMessage (asSystem: login `vamos_edge`, role vamos_system,
// `fetch_types: false`, prepared statements) and the real return-route entry (settlePaidReturn). Only
// Stripe's session read, the confirmation mail and the account step are replaced.
//
// The return route stamps its stripe_events row (`return_<cs>`) with the session's `created`, which is
// always older than the webhook event's. The two orders:
//   return first, then webhook   the webhook's row is later: begin() admits it, the settle function
//                                finds the payment settled and stamps the row (migration 20261007310000).
//   webhook first, then return   the return row is older than a processed row of the same cs_: begin()
//                                answers `superseded`. Before this fix the Worker acked it without
//                                stamping, so the row stayed unprocessed for good.
// Either way the payment is settled once and the confirmation mail goes once.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). The fixture rows
// are committed and stay; every id carries a random tag. Host is fixed to 127.0.0.1. Synthetic rappen
// integers only, never a product CHF figure.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { workerSql } from "../../../../packages/db/test/support/worker-client";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const stripeStub = vi.hoisted(() => ({ session: null as unknown }));
const deliverConfirmation = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => undefined));

vi.mock("./stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    retrieveCheckoutSession: async () => stripeStub.session,
  };
});
vi.mock("./notify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notify")>();
  return { ...actual, deliverConfirmation: (...a: unknown[]) => deliverConfirmation(...a) };
});
vi.mock("./provision-account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provision-account")>();
  return { ...actual, provisionCheckoutAccount: async () => "skipped" };
});

import { handleStripeMessage } from "./settle";
import { settlePaidReturn } from "./return-settle";
import { recordStripeEvent } from "./stripe-event-record";

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const env = {
  HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
} as unknown as CloudflareEnv;

const COMPLETED = "checkout.session.completed";

function paidSession(cs: string, pi: string, created: number): Stripe.Checkout.Session {
  return {
    id: cs,
    payment_intent: pi,
    payment_status: "paid",
    currency: "chf",
    created,
    livemode: false,
    metadata: {},
  } as unknown as Stripe.Checkout.Session;
}

describe.skipIf(!PORT)("U15 both arrival orders through the real begin() (local, committed rows)", () => {
  // Opened in beforeAll: the describe body also runs when the suite is skipped.
  let owner!: ReturnType<typeof workerSql>;
  beforeAll(() => {
    owner = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
  });
  afterAll(async () => {
    await owner?.end({ timeout: 5 });
  });
  beforeEach(() => {
    deliverConfirmation.mockClear();
  });

  /** One pending booking with its snapshot, one leg and one unpaid payment row for `cs`. */
  async function pendingBooking(key: string) {
    const cs = `cs_test_u15_${tag}_${key}`;
    const pi = `pi_u15_${tag}_${key}`;
    const email = `u15-${tag}-${key}@example.test`;
    await owner.begin(async (tx) => {
      const booking = await tx<{ id: string; quote_id: string }[]>`
        insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
        values (${`U15 ${tag} ${key}`}, ${email}, '+41000000031', gen_random_uuid(), 'pending')
        returning id, quote_id`;
      const b = booking[0]!;
      const snap = await tx<{ id: string }[]>`
        insert into public.price_snapshots (
          quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
          engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
          subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen
        )
        select ${b.quote_id}::uuid, vc.id, rv.id, true, sv.id, 'quote-engine@u15', 1, 0,
               '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":9}]'::jsonb,
               jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                                  'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                                  'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                                  'min_advance_minutes', 180, 'policy_doc', 'test'),
               ${b.id}::uuid, now() + interval '30 minutes', now() + interval '30 minutes',
               9, 0, 0, 9
          from (select id from public.vehicle_classes order by id limit 1) as vc,
               (select id from public.rate_versions where status = 'live' limit 1) as rv,
               (select id from public.settings_versions order by id limit 1) as sv
        returning id`;
      await tx`update public.bookings set price_snapshot_id = ${snap[0]!.id}::int8, price_total_rappen = 9 where id = ${b.id}::uuid`;
      await tx`
        insert into public.booking_legs (
          booking_id, leg_seq, direction, pickup_text, dropoff_text,
          scheduled_at, scheduled_local, vehicle_class_id, status
        )
        select ${b.id}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
               now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
               (select id from public.vehicle_classes order by id limit 1), 'pending'`;
      await tx`
        insert into public.booking_payments (
          booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
          charged_rappen, charged_currency, status
        ) values (${b.id}::uuid, ${snap[0]!.id}::int8, ${cs}, ${cs}, 9, 'CHF', 'requires_payment')`;
    });
    const ids = await owner<{ id: string }[]>`select id from public.bookings where contact_email = ${email}`;
    return { cs, pi, bookingId: ids[0]!.id };
  }

  const processed = async (id: string) =>
    (await owner<{ done: boolean }[]>`select processed_at is not null as done from public.stripe_events where id = ${id}`)[0]?.done;

  const state = async (bookingId: string) => {
    const rows = await owner<{ booking: string; payment: string; events: string }[]>`
      select b.status::text as booking,
             (select string_agg(bp.status, ',') from public.booking_payments bp where bp.booking_id = b.id) as payment,
             (select count(*)::text from public.booking_events e where e.booking_id = b.id) as events
        from public.bookings b where b.id = ${bookingId}::uuid`;
    return rows[0]!;
  };

  it("webhook first, then the return route: the return row is closed, nothing is settled twice", async () => {
    const f = await pendingBooking("wr");
    const created = Math.floor(Date.now() / 1000) - 120;
    stripeStub.session = paidSession(f.cs, f.pi, created);

    // The webhook: Stripe stamps its event later than the session's creation.
    const webhookId = `evt_u15_${tag}_wr`;
    expect(await recordStripeEvent(env, { id: webhookId, type: COMPLETED, created: created + 5, objectId: f.cs, payload: { id: webhookId } })).toBe(true);
    const first = await handleStripeMessage(env, { eventId: webhookId, type: COMPLETED, objectId: f.cs, stripeCreated: created + 5 });
    expect(first).toEqual({ ack: true });
    expect(await processed(webhookId)).toBe(true);
    const afterWebhook = await state(f.bookingId);
    expect(afterWebhook).toMatchObject({ booking: "confirmed", payment: "succeeded" });
    expect(deliverConfirmation).toHaveBeenCalledTimes(1);

    // The return route: its row carries session.created, older than the processed webhook row.
    const outcome = await settlePaidReturn(env, stripeStub.session as Stripe.Checkout.Session);
    expect(outcome).toBe("paid");
    expect(await processed(`return_${f.cs}`)).toBe(true);

    // Settled once: same booking, payment and event count; no second confirmation mail.
    expect(await state(f.bookingId)).toEqual(afterWebhook);
    expect(deliverConfirmation).toHaveBeenCalledTimes(1);
  });

  it("return first, then the webhook: both rows are closed, nothing is settled twice", async () => {
    const f = await pendingBooking("rw");
    const created = Math.floor(Date.now() / 1000) - 120;
    stripeStub.session = paidSession(f.cs, f.pi, created);

    const outcome = await settlePaidReturn(env, stripeStub.session as Stripe.Checkout.Session);
    expect(outcome).toBe("paid");
    expect(await processed(`return_${f.cs}`)).toBe(true);
    const afterReturn = await state(f.bookingId);
    expect(afterReturn).toMatchObject({ booking: "confirmed", payment: "succeeded" });
    expect(deliverConfirmation).toHaveBeenCalledTimes(1);

    const webhookId = `evt_u15_${tag}_rw`;
    expect(await recordStripeEvent(env, { id: webhookId, type: COMPLETED, created: created + 5, objectId: f.cs, payload: { id: webhookId } })).toBe(true);
    const second = await handleStripeMessage(env, { eventId: webhookId, type: COMPLETED, objectId: f.cs, stripeCreated: created + 5 });
    expect(second).toEqual({ ack: true });
    expect(await processed(webhookId)).toBe(true);

    expect(await state(f.bookingId)).toEqual(afterReturn);
    expect(deliverConfirmation).toHaveBeenCalledTimes(1);
  });
});
