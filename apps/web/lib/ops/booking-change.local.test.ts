// apps/web/lib/ops/booking-change.local.test.ts
//
// 26.2 P1 end to end on a real local database through the REAL Worker client (asStaff / asSystem /
// asQuote, `fetch_types: false`, login `vamos_edge` then the role). Only Stripe, Mapbox and the mail
// sender are replaced. A booking is seeded the way checkout writes it (lines from checkoutCharge,
// shown class totals, 10 m distance) on a live price book; then:
//   dearer  preview -> confirm (request waits, booking unchanged) -> the difference is paid (extra
//           settle) -> the class changes, the driver comes off, the confirmation is built from the
//           definer reads and handed to the mail sender;
//   cheaper confirm -> class changes at once, Refund due -> the admin's Refund sends exactly the
//           difference (credit tier) -> the live trip reads none again.
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed (use a scratch
// stack); synthetic rappen only. Host fixed to 127.0.0.1.
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

const createCheckoutSession = vi.fn();
const createRefund = vi.fn();
const expireCheckoutSession = vi.fn(async (..._a: unknown[]) => ({ status: "expired" }));
const sendClassChangePay = vi.fn();
const sendConfirmation = vi.fn();
const sendChauffeurUnassign = vi.fn();

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: vi.fn(async () => null),
    expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
    resolvePaymentIntentId: async (_s: unknown, id: string) => id,
    retrieveRefund: async (_s: unknown, id: string) => ({ id, status: "succeeded" }),
    findRefundByIntent: async () => null,
    createRefund: (...a: unknown[]) => createRefund(...a),
  };
});
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return {
    ...actual,
    sendClassChangePay: (...a: unknown[]) => sendClassChangePay(...a),
    sendConfirmation: (...a: unknown[]) => sendConfirmation(...a),
    sendChauffeurUnassign: (...a: unknown[]) => sendChauffeurUnassign(...a),
  };
});

describe.skipIf(!PORT)("class change on a paid trip through the real Worker client (local, committed rows)", () => {
  const env = {
    HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    STRIPE_SECRET_KEY: "sk_test_local",
    RESEND_API_KEY: "re_local",
  } as unknown as CloudflareEnv;
  const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  const adminId = `${tag}-0000-4000-a000-000000000002`;
  const claims = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;
  const ECO = `p1e-eco-${tag}`;
  const BIZ = `p1e-biz-${tag}`;
  const METRES = 31_417;

  it("dearer waits for the difference and changes when paid; cheaper changes now and refunds exactly by hand", async () => {
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    try {
      // --- a live price book with two classes, an admin, a driver -------------------------------------
      await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
               values (${adminId}, ${`p1e-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
      await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'P1E Admin')`;
      await su`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, sort_order, name)
               values (${ECO}, 4, 4, 1, 'Economy'), (${BIZ}, 7, 7, 2, 'Business')`;
      await su`update public.rate_versions set status = 'retired' where status = 'live'`;
      const [rv] = await su<{ id: string }[]>`insert into public.rate_versions (slug, label) values (${`p1e-${tag}`}, 'P1 e2e') returning id`;
      await su`insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
               select ${rv!.id}, vc.id, 8, case when vc.slug = ${ECO} then 1000 else 1200 end,
                      case when vc.slug = ${ECO} then 300 else 420 end, null
                 from public.vehicle_classes vc where vc.slug in (${ECO}, ${BIZ})`;
      await su`update public.rate_versions set status = 'live' where id = ${rv!.id}`;
      await su`insert into public.vehicles (vehicle_class_id, model, plate, seats, bags)
               select vc.id, 'P1E Car', ${`ZH-${tag}`}, 4, 4 from public.vehicle_classes vc where vc.slug = ${ECO}`;
      const [driver] = await su<{ id: string }[]>`
        insert into public.chauffeurs (full_name, phone, email, licence_number, default_vehicle_id, languages)
        select 'P1E Driver', '+41 79 260 00 09', ${`p1e-driver-${tag}@example.test`}, ${`LIC-${tag}`}, v.id, array['de']
          from public.vehicles v where v.plate = ${`ZH-${tag}`} returning id`;

      const { loadRateBook } = await import("../db/quote");
      const { mapRateBook } = await import("../pricing/rateBook");
      const { priceQuote } = await import("../pricing/priceQuote");
      const { checkoutCharge } = await import("../checkout/checkout-charge");
      const { snapshotLinesFromCharge } = await import("../checkout/lock-to-rpc");
      const { loadSettingsRows } = await import("./draft-preview");
      const { quoteInputFromFacts } = await import("./booking-change-price");
      const { previewBookingChange, confirmBookingChange, afterExtraSettled, withdrawBookingChange } = await import("./booking-change");
      const { refundBooking } = await import("./refund");
      const { asSystem } = await import("../db/identity");

      // --- checkout, as it writes a booking (real live book through asQuote) -------------------------
      const nowIso = new Date().toISOString();
      const live = mapRateBook(await loadRateBook(env, { preferDraft: false }));
      expect(live.rate_version?.id).toBe(Number(rv!.id));
      const settings = (await loadSettingsRows(env, claims, nowIso)).rows;
      const facts = {
        scheduledLocal: "2030-01-01T10:00", distanceM: METRES, distanceToleranceM: 0, durationS: 2400,
        originZoneId: null, destZoneId: null, originPlace: "Zurich", destPlace: "Zug", originCanton: null, destCanton: null,
        originCityId: null, destCityId: null, originCityName: null, destCityName: null, originIsAirport: false,
        flightNo: null, pax: 2, bags: 1,
      };
      const quote = priceQuote(live, settings, quoteInputFromFacts(facts, METRES, nowIso));
      const charged = (slug: string) => {
        const net = quote.classes.find((c) => c.slug === slug)!.total_rappen!;
        const c = checkoutCharge({ classNetRappen: net, preCouponRappen: null, extraCodes: [], catalog: [], coupon: null, vatRateBps: 81, vehicleClassSlug: slug });
        if (!c.ok) throw new Error("charge");
        return c;
      };
      const shown = quote.classes.map((c) => ({ slug: c.slug, total_rappen: c.eligible ? c.total_rappen : null }));

      async function seedBooking(key: string, slug: string, withDriver: boolean) {
        const c = charged(slug);
        return su.begin(async (tx) => {
          const [b] = await tx<{ id: string; reference: string }[]>`
            insert into public.bookings (reference, contact_name, contact_email, status, locale)
            values (public.next_booking_reference(), ${`P1E ${key}`}, ${`p1e-${tag}-${key}@example.test`}, 'confirmed', 'de')
            returning id, reference`;
          await tx`
            insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, scheduled_local,
                                             vehicle_class_id, status, pax, bags, estimated_duration_minutes, pickup_lat, pickup_lng)
            select ${b!.id}, 1, 'outbound', 'Zurich', 'Zug', now() + interval '48 hours', '2030-01-01T10:00', vc.id, 'confirmed', 2, 1, 40, 47.37, 8.54
              from public.vehicle_classes vc where vc.slug = ${slug}`;
          await tx`set local session_replication_role = replica`;
          const [snap] = await tx<{ id: string }[]>`
            insert into public.price_snapshots (
              quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags,
              lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at,
              booking_id, source, distance_km, duration_min, shown_alternatives)
            select gen_random_uuid(), vc.id, ${rv!.id}, true, sv.id, 'quote-engine@p1e', 2, 1,
                   ${tx.json(snapshotLinesFromCharge(c.lines) as unknown as postgres.JSONValue)},
                   jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
                     'city_waiting_minutes', 15, 'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'p1e', 'extras', '[]'::jsonb),
                   ${c.chargedRappen}, 0, 0, ${c.chargedRappen}, now() + interval '1 day', now() + interval '1 day',
                   ${b!.id}, 'web', ${(METRES / 1000).toFixed(2)}::numeric, 40,
                   ${tx.json(shown as unknown as postgres.JSONValue)}
              from public.vehicle_classes vc cross join lateral (select id from public.settings_versions order by id limit 1) sv
             where vc.slug = ${slug} returning id`;
          await tx`update public.bookings set price_snapshot_id = ${snap!.id} where id = ${b!.id}`;
          await tx`insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
                   values (${b!.id}, ${snap!.id}, ${`pi_p1e_${tag}_${key}`}, ${c.chargedRappen}, 'succeeded', now())`;
          await tx`set local session_replication_role = origin`;
          if (withDriver) {
            await tx`update public.booking_legs set assigned_chauffeur_id = ${driver!.id}, assigned_vehicle_id = (select default_vehicle_id from public.chauffeurs where id = ${driver!.id}), status = 'assigned'
                      where booking_id = ${b!.id}`;
          }
          return { id: b!.id, reference: b!.reference, paid: c.chargedRappen };
        });
      }

      // --- dearer: Economy -> Business --------------------------------------------------------------
      const dear = await seedBooking("dear", ECO, true);
      const preview = await previewBookingChange(env, claims, dear.reference);
      expect(preview).toMatchObject({ ok: true, currentClass: ECO, paidRappen: dear.paid, rateVersionId: Number(rv!.id) });
      if (!preview.ok) return;
      const biz = preview.classes.find((c) => c.slug === BIZ)!;
      expect(biz).toMatchObject({ ok: true, name: "Business", newTotalRappen: charged(BIZ).chargedRappen });

      createCheckoutSession.mockResolvedValue({ id: `cs_p1e_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_p1e_${tag}` });
      sendClassChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
      const confirmed = await confirmBookingChange(env, claims, dear.reference, {
        klass: BIZ, expectTotalRappen: biz.newTotalRappen, expectPaidRappen: preview.paidRappen,
      });
      expect(confirmed).toMatchObject({ ok: true, outcome: "extra_required", mailed: true, differenceRappen: biz.newTotalRappen! - dear.paid });
      expect(createCheckoutSession.mock.calls[0]![1]).toMatchObject({ chargedRappen: biz.newTotalRappen! - dear.paid, uiMode: "hosted_page" });
      expect(sendClassChangePay.mock.calls[0]![1]).toMatchObject({ className: "Business", newTotalRappen: biz.newTotalRappen, paidRappen: dear.paid });

      const waiting = (await su<{ slug: string; actor: string; status: string; t: string; session: string }[]>`
        select vc.slug, r.actor, r.status, jsonb_typeof(r.payload) as t, r.extra_session_id as session
          from public.booking_edit_requests r
          join public.booking_legs l on l.booking_id = r.booking_id
          join public.vehicle_classes vc on vc.id = l.vehicle_class_id
         where r.booking_id = ${dear.id}`)[0]!;
      expect(waiting).toEqual({ slug: ECO, actor: "staff", status: "requested", t: "object", session: `cs_p1e_${tag}` });

      // The difference is paid: the Stripe webhook's settle, as the system role.
      const settled = await asSystem(env, async (sql) =>
        (await sql<{ applied: boolean; class_changed: boolean; unassigned_chauffeur_id: string | null; booking_id: string }[]>`
          select * from public.checkout_extra_payment_settle(${`evt_p1e_${tag}`}, ${`cs_p1e_${tag}`}, ${`pi_p1e_${tag}_x`}, 'succeeded',
                                                             'CHF', null, null, null::timestamptz, null)`)[0]!,
      );
      expect(settled).toMatchObject({ applied: true, class_changed: true, unassigned_chauffeur_id: driver!.id });
      sendConfirmation.mockResolvedValue({ ok: true, providerMessageId: "m2" });
      sendChauffeurUnassign.mockResolvedValue({ ok: true, providerMessageId: "m3" });
      await afterExtraSettled(env, { booking_id: settled.booking_id, applied: true, unassigned_chauffeur_id: settled.unassigned_chauffeur_id });
      expect(sendConfirmation).toHaveBeenCalledTimes(1);
      const mail = sendConfirmation.mock.calls[0]![1] as { totalRappen: number; legs: { vehicleClassLabel: string }[] };
      expect(mail.totalRappen).toBe(biz.newTotalRappen);
      expect(mail.legs[0]!.vehicleClassLabel).toBe("Business");
      expect(sendChauffeurUnassign.mock.calls[0]![2]).toBe(`p1e-driver-${tag}@example.test`);
      const after = (await su<{ slug: string; driver: string | null }[]>`
        select vc.slug, l.assigned_chauffeur_id::text as driver from public.booking_legs l
          join public.vehicle_classes vc on vc.id = l.vehicle_class_id where l.booking_id = ${dear.id}`)[0]!;
      expect(after).toEqual({ slug: BIZ, driver: null });

      // --- withdraw (owner sign-off 2026-10-01): a dearer change that waits is ended, nothing charged --
      const wd = await seedBooking("wd", ECO, false);
      const pw = await previewBookingChange(env, claims, wd.reference);
      if (!pw.ok) throw new Error(`preview refused: ${JSON.stringify(pw)}`);
      const wbiz = pw.classes.find((c) => c.slug === BIZ)!;
      createCheckoutSession.mockResolvedValueOnce({ id: `cs_p1e_wd_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_p1e_wd_${tag}` });
      expect(await confirmBookingChange(env, claims, wd.reference, {
        klass: BIZ, expectTotalRappen: wbiz.newTotalRappen, expectPaidRappen: pw.paidRappen,
      })).toMatchObject({ ok: true, outcome: "extra_required" });
      expect(await withdrawBookingChange(env, claims, wd.reference)).toEqual({ ok: true, bookingId: wd.id, reference: wd.reference });
      expect(expireCheckoutSession.mock.calls.at(-1)![1]).toBe(`cs_p1e_wd_${tag}`);
      expect((await su<{ st: string; slug: string }[]>`
        select r.status as st, vc.slug from public.booking_edit_requests r
          join public.booking_legs l on l.booking_id = r.booking_id
          join public.vehicle_classes vc on vc.id = l.vehicle_class_id
         where r.booking_id = ${wd.id}`)[0]).toEqual({ st: "withdrawn", slug: ECO });
      expect(await withdrawBookingChange(env, claims, wd.reference)).toEqual({ ok: false, code: "nothing-waiting" });

      // --- cheaper: Business -> Economy, then the admin's Refund ------------------------------------
      const cheap = await seedBooking("cheap", BIZ, false);
      const p2 = await previewBookingChange(env, claims, cheap.reference);
      if (!p2.ok) throw new Error(`preview refused: ${JSON.stringify(p2)}`);
      const eco = p2.classes.find((c) => c.slug === ECO)!;
      const down = await confirmBookingChange(env, claims, cheap.reference, {
        klass: ECO, expectTotalRappen: eco.newTotalRappen, expectPaidRappen: p2.paidRappen,
      });
      const due = cheap.paid - eco.newTotalRappen!;
      expect(down).toMatchObject({ ok: true, outcome: "refund_due", differenceRappen: -due, confirmationSent: true });
      expect((await su<{ s: string; owed: string }[]>`select refund_status as s, refund_owed_rappen::text as owed from public.bookings where id = ${cheap.id}`)[0])
        .toEqual({ s: "pending_ops", owed: String(due) });
      expect(createRefund).not.toHaveBeenCalled();

      createRefund.mockImplementation(async () => ({ id: `re_p1e_${tag}`, status: "succeeded" }));
      const refunded = await refundBooking(env, claims, cheap.reference, {});
      expect(refunded).toMatchObject({ ok: true, refundedRappen: due });
      expect(createRefund.mock.calls[0]![1]).toMatchObject({ amountRappen: due });
      expect((await su<{ s: string; r: string }[]>`select refund_status as s, refunded_rappen::text as r from public.bookings where id = ${cheap.id}`)[0])
        .toEqual({ s: "none", r: String(due) });
    } finally {
      // The other local suites publish their own live book (one live at a time): leave none live.
      await su`update public.rate_versions set status = 'retired' where slug = ${`p1e-${tag}`} and status = 'live'`.catch(() => undefined);
      await su.end({ timeout: 5 });
    }
  });
});
