// apps/web/lib/ops/trip-change.local.test.ts
//
// 26.2 P6 end to end on a real local database through the REAL Worker client (asStaff / asSystem /
// asQuote, `fetch_types: false`, login `vamos_edge` then the role). The quote pipeline, the signed
// lock, P1's price step, the change functions of migration 20261007150000 and the PATCH route run
// for real; only Mapbox (retrieve, reverse, directions), Stripe and the mail sender are replaced.
// Bookings are seeded the way checkout writes them (lines from checkoutCharge, shown class totals,
// 10 m distance, coordinates and Mapbox ids) on a live price book; then:
//   dearer   a new pickup: preview (signed facts) -> confirm (request waits, trip unchanged, Stripe
//            page for the difference, the owner's D14 e-mail) -> the difference is paid (extra
//            settle) -> the new place, its id, coordinates and duration are written, the driver
//            stays and gets "trip assigned" again;
//   cheaper  a nearer destination: written at once, Refund due with the full difference;
//   time     a new time only: no price, written at once, the driver gets the time-change e-mail;
//   clash    a new time onto another trip of the driver: the preview names it, Keep is refused
//            (D11 open), Take off works and he gets "trip taken off";
//   PATCH    a paid trip's places are refused (use-change), the contact is saved and recorded.
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
const sendTripChangePay = vi.fn();
const sendConfirmation = vi.fn();
const sendChauffeurAssign = vi.fn();
const sendChauffeurUnassign = vi.fn();
const sendTimeChange = vi.fn();
const sendFlightNumber = vi.fn();
let routeEnv: CloudflareEnv | null = null;

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: vi.fn(async () => null),
    expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
    createRefund: (...a: unknown[]) => createRefund(...a),
  };
});
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return {
    ...actual,
    sendTripChangePay: (...a: unknown[]) => sendTripChangePay(...a),
    sendConfirmation: (...a: unknown[]) => sendConfirmation(...a),
    sendChauffeurAssign: (...a: unknown[]) => sendChauffeurAssign(...a),
    sendChauffeurUnassign: (...a: unknown[]) => sendChauffeurUnassign(...a),
    sendTimeChange: (...a: unknown[]) => sendTimeChange(...a),
    sendFlightNumber: (...a: unknown[]) => sendFlightNumber(...a),
  };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: routeEnv }) }));
vi.mock("@/lib/ops/staff-json", async () => {
  const actual = await vi.importActual<typeof import("./staff-json")>("./staff-json");
  return {
    ...actual,
    withStaff: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) =>
      (request: Request) => handler(STAFF_CLAIMS, request),
  };
});

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000006`;
const STAFF_CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("place and time changes on a paid trip through the real Worker client (local, committed rows)", () => {
  const kv = new Map<string, string>();
  const env = {
    HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    STRIPE_SECRET_KEY: "sk_test_local",
    RESEND_API_KEY: "re_local",
    QUOTE_LOCK_SECRET: `p6-local-${tag}`,
    MAPBOX_DAILY_UNIT_SENTINEL: "5000",
    QUOTE_ABUSE: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
    },
  } as unknown as CloudflareEnv;
  routeEnv = env;
  const claims = STAFF_CLAIMS;
  const ECO = `p6e-eco-${tag}`;
  const BIZ = `p6e-biz-${tag}`;

  // Mapbox, replaced: four places and a driving route by destination.
  const PLACES: Record<string, { name: string; lng: number; lat: number; canton: string; cityId: string; isAirport: boolean }> = {
    "mb-oerlikon": { name: "Zurich Oerlikon", lng: 8.5442, lat: 47.4115, canton: "ZH", cityId: "city-zurich", isAirport: false },
    "mb-zrh": { name: "Zurich Airport", lng: 8.5624, lat: 47.4504, canton: "ZH", cityId: "city-kloten", isAirport: true },
    "mb-zug": { name: "Zug station", lng: 8.5152, lat: 47.1737, canton: "ZG", cityId: "city-zug", isAirport: false },
    "mb-wallisellen": { name: "Wallisellen", lng: 8.5967, lat: 47.4148, canton: "ZH", cityId: "city-wallisellen", isAirport: false },
  };
  const retrieve = vi.fn(async (input: { mapboxId: string }) => {
    const p = PLACES[input.mapboxId];
    return { place: p ? { mapbox_id: input.mapboxId, address: "", cityName: null, ...p } : null };
  });
  const reverse = vi.fn(async () => ({ place: null }));
  const routeLegs = vi.fn(async (legs: { origin: { lng: number }; destination: { lng: number } }[]) => ({
    ok: true as const,
    legs: legs.map((l, i) => {
      const toZug = l.origin.lng === PLACES["mb-zug"]!.lng;
      const toWallisellen = l.destination.lng === PLACES["mb-wallisellen"]!.lng;
      return {
        leg_seq: (i + 1) as 1 | 2,
        distance_m: toZug ? 42_517 : toWallisellen ? 6_210 : 31_417,
        duration_s: toZug ? 3_300 : toWallisellen ? 660 : 2_400,
        geometry: { type: "LineString" as const, coordinates: [] as [number, number][] },
      };
    }),
  }));

  it("dearer waits and is written when paid; cheaper, time, clash and PATCH behave as decided", { timeout: 60_000 }, async () => {
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    try {
      // --- a live price book with two classes, an admin, three drivers -------------------------------
      await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
               values (${adminId}, ${`p6e-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
      await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'P6E Admin')`;
      await su`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, sort_order, name)
               values (${ECO}, 4, 4, 1, 'Economy'), (${BIZ}, 7, 7, 2, 'Business')`;
      await su`update public.rate_versions set status = 'retired' where status = 'live'`;
      const [rv] = await su<{ id: string }[]>`insert into public.rate_versions (slug, label) values (${`p6e-${tag}`}, 'P6 e2e') returning id`;
      await su`insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
               select ${rv!.id}, vc.id, 8, case when vc.slug = ${ECO} then 1000 else 1200 end,
                      case when vc.slug = ${ECO} then 300 else 420 end, null
                 from public.vehicle_classes vc where vc.slug in (${ECO}, ${BIZ})`;
      await su`update public.rate_versions set status = 'live' where id = ${rv!.id}`;
      const drivers: Record<string, string> = {};
      for (const d of ["a", "b", "c"]) {
        const [row] = await su<{ id: string }[]>`
          insert into public.chauffeurs (full_name, phone, email, licence_number, languages, vehicle_class_id)
          select ${`P6E Driver ${d}`}, '+41 79 260 06 09', ${`p6e-driver-${d}-${tag}@example.test`}, ${`LIC-${d}-${tag}`}, array['de'], vc.id
            from public.vehicle_classes vc where vc.slug = ${ECO} returning id`;
        drivers[d] = row!.id;
      }

      const { loadRateBook } = await import("../db/quote");
      const { mapRateBook } = await import("../pricing/rateBook");
      const { priceQuote } = await import("../pricing/priceQuote");
      const { checkoutCharge } = await import("../checkout/checkout-charge");
      const { snapshotLinesFromCharge } = await import("../checkout/lock-to-rpc");
      const { loadSettingsRows } = await import("./draft-preview");
      const { quoteInputFromFacts } = await import("./booking-change-price");
      const { defaultChangeDeps, afterExtraSettled } = await import("./booking-change");
      const { previewTripChange, confirmTripChange } = await import("./booking-trip-change");
      const { runTripFacts } = await import("./trip-change-facts");
      const { buildQuotePipelineDeps } = await import("../quote/deps");
      const { asSystem } = await import("../db/identity");
      const { PATCH } = await import("../../app/[locale]/(ops)/api/staff/bookings/[id]/route");

      // The real trip facts step with Mapbox replaced (the pipeline, the breaker and the lock are real).
      const deps = {
        ...defaultChangeDeps,
        tripFacts: (e: CloudflareEnv, input: Parameters<typeof runTripFacts>[1]) => {
          const base = buildQuotePipelineDeps(e, { dashboardHost: false });
          return runTripFacts(e, input, { pipelineDeps: { ...base, routeLegs }, retrieve, reverse });
        },
      };

      // --- checkout, as it writes a booking (real live book through asQuote) -------------------------
      const nowIso = new Date().toISOString();
      const live = mapRateBook(await loadRateBook(env, { preferDraft: false }));
      expect(live.rate_version?.id).toBe(Number(rv!.id));
      const settings = (await loadSettingsRows(env, claims, nowIso)).rows;
      const factsAt = (metres: number, durationS: number) => ({
        scheduledLocal: "2030-01-01T10:00", distanceM: metres, distanceToleranceM: 0, durationS,
        originZoneId: null, destZoneId: null, originPlace: "Zurich Oerlikon", destPlace: "Zurich Airport", originCanton: null, destCanton: null,
        originCityId: null, destCityId: null, originCityName: null, destCityName: null, originIsAirport: false,
        flightNo: null, pax: 2, bags: 1,
      });
      const charged = (slug: string, metres: number, durationS: number) => {
        const quote = priceQuote(live, settings, quoteInputFromFacts(factsAt(metres, durationS), metres, nowIso));
        const net = quote.classes.find((c) => c.slug === slug)!.total_rappen!;
        const c = checkoutCharge({ classNetRappen: net, preCouponRappen: null, extraCodes: [], catalog: [], coupon: null, vatRateBps: 81, vehicleClassSlug: slug });
        if (!c.ok) throw new Error("charge");
        return { ...c, shown: quote.classes.map((x) => ({ slug: x.slug, total_rappen: x.eligible ? x.total_rappen : null })) };
      };

      async function seedBooking(key: string, slug: string, opts: { local?: string; metres?: number; driver?: string } = {}) {
        const metres = opts.metres ?? 31_417;
        const local = opts.local ?? "2030-01-01T10:00";
        const c = charged(slug, metres, 2_400);
        return su.begin(async (tx) => {
          const [b] = await tx<{ id: string; reference: string }[]>`
            insert into public.bookings (reference, contact_name, contact_email, contact_phone, status, locale)
            values (public.next_booking_reference(), ${`P6E ${key}`}, ${`p6e-${tag}-${key}@example.test`}, '+41 79 000 00 06', 'confirmed', 'de')
            returning id, reference`;
          await tx`
            insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, pickup_place_id, pickup_lat, pickup_lng,
                                             dropoff_text, dropoff_place_id, dropoff_lat, dropoff_lng, scheduled_at, scheduled_local,
                                             vehicle_class_id, status, pax, bags, estimated_duration_minutes)
            select ${b!.id}, 1, 'outbound', 'Zurich Oerlikon', 'mb-oerlikon', 47.4115, 8.5442, 'Zurich Airport', 'mb-zrh', 47.4504, 8.5624,
                   -- ::text first: postgres.js serialises a param typed timestamp through new Date() in the
                   -- client's time zone (a Mac in Dubai shifted it by 4 h; Workers run in UTC).
                   (${local}::text::timestamp at time zone 'Europe/Zurich'), ${local}, vc.id, 'confirmed', 2, 1, 40
              from public.vehicle_classes vc where vc.slug = ${slug}`;
          await tx`set local session_replication_role = replica`;
          const [snap] = await tx<{ id: string }[]>`
            insert into public.price_snapshots (
              quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags,
              lines, policy, subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at,
              booking_id, source, distance_km, duration_min, shown_alternatives)
            select gen_random_uuid(), vc.id, ${rv!.id}, true, sv.id, 'quote-engine@p6e', 2, 1,
                   ${tx.json(snapshotLinesFromCharge(c.lines) as unknown as postgres.JSONValue)},
                   jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
                     'city_waiting_minutes', 15, 'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'p6e', 'extras', '[]'::jsonb),
                   ${c.chargedRappen}, 0, 0, ${c.chargedRappen}, now() + interval '1 day', now() + interval '1 day',
                   ${b!.id}, 'web', ${(metres / 1000).toFixed(2)}::numeric, 40,
                   ${tx.json(c.shown as unknown as postgres.JSONValue)}
              from public.vehicle_classes vc cross join lateral (select id from public.settings_versions order by id limit 1) sv
             where vc.slug = ${slug} returning id`;
          await tx`update public.bookings set price_snapshot_id = ${snap!.id} where id = ${b!.id}`;
          await tx`insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
                   values (${b!.id}, ${snap!.id}, ${`pi_p6e_${tag}_${key}`}, ${c.chargedRappen}, 'succeeded', now())`;
          await tx`set local session_replication_role = origin`;
          if (opts.driver) {
            await tx`update public.booking_legs set assigned_chauffeur_id = ${opts.driver}, status = 'assigned' where booking_id = ${b!.id}`;
            await tx`update public.bookings set status = 'assigned' where id = ${b!.id}`;
          }
          return { id: b!.id, reference: b!.reference, paid: c.chargedRappen };
        });
      }
      const leg = async (id: string) =>
        (await su<{ pickup_text: string; pickup_place_id: string | null; pickup_lat: string; pickup_lng: string; dropoff_text: string;
                    dropoff_lat: string; estimated_duration_minutes: number; scheduled_local: string; driver: string | null; pax: number }[]>`
          select pickup_text, pickup_place_id, pickup_lat::text, pickup_lng::text, dropoff_text, dropoff_lat::text,
                 estimated_duration_minutes, scheduled_local, assigned_chauffeur_id::text as driver, pax
            from public.booking_legs where booking_id = ${id}`)[0]!;
      const zug = { kind: "retrieve" as const, mapbox_id: "mb-zug", session_token: `tok-${tag}`, text: "Zug station, Bahnhofplatz, 6300 Zug" };
      const NO = { pickup: null, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: null, driver: null };

      // --- dearer: a new pickup at Zug, driver a stays --------------------------------------------------
      const dear = await seedBooking("dear", ECO, { driver: drivers.a });
      const p1 = await previewTripChange(env, claims, dear.reference, { ...NO, pickup: zug }, deps);
      if (!p1.ok) throw new Error(`preview refused: ${JSON.stringify(p1)}`);
      const want = charged(ECO, 42_517, 3_300).chargedRappen;
      const eco = p1.classes.find((c) => c.slug === ECO)!;
      expect(eco).toMatchObject({ ok: true, current: true, newTotalRappen: want, differenceRappen: want - dear.paid });
      expect(p1.lock).toEqual(expect.any(String));
      expect(p1.pickupIsAirport).toBe(false);
      expect(p1).not.toHaveProperty("driverClash");
      const unitsAfterPreview = [...kv.values()].map(Number).reduce((a, b) => a + b, 0);
      expect(unitsAfterPreview).toBe(3);

      createCheckoutSession.mockResolvedValue({ id: `cs_p6e_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_p6e_${tag}` });
      sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
      retrieve.mockClear();
      const c1 = await confirmTripChange(env, claims, dear.reference, {
        klass: null, expectTotalRappen: want, expectPaidRappen: p1.paidRappen,
        trip: { ...NO, pickup: { ...zug, text: "Typed elsewhere" }, lock: p1.lock! },
      }, "https://dashboard.vamostaxi.site", deps);
      expect(c1).toMatchObject({ ok: true, outcome: "extra_required", mailed: true, differenceRappen: want - dear.paid });
      // The confirm made no Mapbox call; the units stay where the preview left them.
      expect(retrieve).not.toHaveBeenCalled();
      expect([...kv.values()].map(Number).reduce((a, b) => a + b, 0)).toBe(unitsAfterPreview);
      expect(createCheckoutSession.mock.calls[0]![1]).toMatchObject({ chargedRappen: want - dear.paid, uiMode: "hosted_page" });
      expect(sendTripChangePay.mock.calls[0]![1]).toMatchObject({ changes: { pickup: "Zug station" }, newTotalRappen: want, paidRappen: dear.paid });
      expect(await leg(dear.id)).toMatchObject({ pickup_text: "Zurich Oerlikon", pickup_place_id: "mb-oerlikon", estimated_duration_minutes: 40 });
      const waiting = (await su<{ status: string; t: string; place: string; session: string }[]>`
        select status, jsonb_typeof(payload) as t, payload ->> 'pickup_place_id' as place, extra_session_id as session
          from public.booking_edit_requests where booking_id = ${dear.id}`)[0]!;
      expect(waiting).toEqual({ status: "requested", t: "object", place: "mb-zug", session: `cs_p6e_${tag}` });

      // The difference is paid: the Stripe webhook's settle, as the system role.
      const settled = await asSystem(env, async (sql) =>
        (await sql<{ applied: boolean; class_changed: boolean; unassigned_chauffeur_id: string | null; booking_id: string; request_id: string }[]>`
          select * from public.checkout_extra_payment_settle(${`evt_p6e_${tag}`}, ${`cs_p6e_${tag}`}, ${`pi_p6e_${tag}_x`}, 'succeeded',
                                                             'CHF', null, null, null::timestamptz, null)`)[0]!,
      );
      expect(settled).toMatchObject({ applied: true, class_changed: false, unassigned_chauffeur_id: null });
      expect(await leg(dear.id)).toMatchObject({
        pickup_text: "Zug station", pickup_place_id: "mb-zug", pickup_lat: "47.173700", pickup_lng: "8.515200",
        dropoff_text: "Zurich Airport", estimated_duration_minutes: 55, driver: drivers.a,
      });
      const snap = (await su<{ km: string; min: number; total: number }[]>`
        select s.distance_km::text as km, s.duration_min as min, s.total_rappen::int as total
          from public.bookings b join public.price_snapshots s on s.id = b.price_snapshot_id where b.id = ${dear.id}`)[0]!;
      expect(snap).toEqual({ km: "42.52", min: 55, total: want });
      sendConfirmation.mockResolvedValue({ ok: true, providerMessageId: "m2" });
      sendChauffeurAssign.mockResolvedValue({ ok: true, providerMessageId: "m3" });
      await afterExtraSettled(env, { booking_id: settled.booking_id, applied: true, unassigned_chauffeur_id: null, request_id: settled.request_id });
      expect(sendConfirmation).toHaveBeenCalledTimes(1);
      expect(sendChauffeurAssign).toHaveBeenCalledTimes(1);
      expect(sendChauffeurAssign.mock.calls[0]![1]).toMatchObject({ pickupText: "Zug station", dropoffText: "Zurich Airport" });
      expect(sendChauffeurAssign.mock.calls[0]![2]).toBe(`p6e-driver-a-${tag}@example.test`);

      // --- cheaper: a nearer destination -----------------------------------------------------------------
      const cheap = await seedBooking("cheap", ECO);
      const nearer = { kind: "retrieve" as const, mapbox_id: "mb-wallisellen", session_token: `tok2-${tag}`, text: "Wallisellen" };
      const p2 = await previewTripChange(env, claims, cheap.reference, { ...NO, dropoff: nearer }, deps);
      if (!p2.ok) throw new Error(`preview refused: ${JSON.stringify(p2)}`);
      const short = charged(ECO, 6_210, 660).chargedRappen;
      expect(p2.classes.find((c) => c.slug === ECO)).toMatchObject({ newTotalRappen: short });
      const c2 = await confirmTripChange(env, claims, cheap.reference, {
        klass: null, expectTotalRappen: short, expectPaidRappen: p2.paidRappen, trip: { ...NO, dropoff: nearer, lock: p2.lock! },
      }, undefined, deps);
      const due = cheap.paid - short;
      expect(c2).toMatchObject({ ok: true, outcome: "refund_due", differenceRappen: -due, confirmationSent: true });
      expect((await su<{ s: string; owed: string }[]>`select refund_status as s, refund_owed_rappen::text as owed from public.bookings where id = ${cheap.id}`)[0])
        .toEqual({ s: "pending_ops", owed: String(due) });
      expect(await leg(cheap.id)).toMatchObject({ dropoff_text: "Wallisellen", dropoff_lat: "47.414800", estimated_duration_minutes: 11 });
      expect(createRefund).not.toHaveBeenCalled();

      // --- time only: driver b stays and gets the time-change e-mail -------------------------------------
      const timed = await seedBooking("time", ECO, { driver: drivers.b });
      const p3 = await previewTripChange(env, claims, timed.reference, { ...NO, scheduledLocal: "2030-01-01T12:00" }, deps);
      if (!p3.ok) throw new Error(`preview refused: ${JSON.stringify(p3)}`);
      expect(p3.classes.find((c) => c.current)).toMatchObject({ ok: true, newTotalRappen: timed.paid, differenceRappen: 0 });
      sendTimeChange.mockResolvedValue({ ok: true, providerMessageId: "m4" });
      const c3 = await confirmTripChange(env, claims, timed.reference, {
        klass: null, expectTotalRappen: timed.paid, expectPaidRappen: p3.paidRappen, trip: { ...NO, scheduledLocal: "2030-01-01T12:00" },
      }, undefined, deps);
      expect(c3).toMatchObject({ ok: true, outcome: "applied", driverUpdated: true, confirmationSent: true });
      expect(await leg(timed.id)).toMatchObject({ scheduled_local: "2030-01-01T12:00", driver: drivers.b, pickup_text: "Zurich Oerlikon" });
      expect(sendTimeChange.mock.calls[0]![1]).toMatchObject({ scheduledLocal: "2030-01-01T12:00", outcome: "confirmed" });
      expect(sendTimeChange.mock.calls[0]![2]).toBe(`p6e-driver-b-${tag}@example.test`);
      expect((await su<{ n: number }[]>`select count(*)::int as n from public.booking_events where booking_id = ${timed.id} and kind = 'booking.modified'`)[0]!.n).toBe(1);

      // --- clash: driver c on two trips; moving one onto the other ---------------------------------------
      const first = await seedBooking("first", ECO, { local: "2030-01-02T10:00", driver: drivers.c });
      const other = await seedBooking("other", ECO, { local: "2030-01-02T14:00", driver: drivers.c });
      const p4 = await previewTripChange(env, claims, first.reference, { ...NO, scheduledLocal: "2030-01-02T14:10" }, deps);
      expect(p4).toMatchObject({ ok: true, driverClash: { reference: other.reference, time: "14:00" } });
      const move = { klass: null, expectTotalRappen: first.paid, expectPaidRappen: first.paid };
      expect(await confirmTripChange(env, claims, first.reference, { ...move, trip: { ...NO, scheduledLocal: "2030-01-02T14:10" } }, undefined, deps))
        .toEqual({ ok: false, code: "driver-choice-needed" });
      expect(await confirmTripChange(env, claims, first.reference, { ...move, trip: { ...NO, scheduledLocal: "2030-01-02T14:10", driver: "keep" } }, undefined, deps))
        .toEqual({ ok: false, code: "driver-overlap" });
      expect(await leg(first.id)).toMatchObject({ scheduled_local: "2030-01-02T10:00", driver: drivers.c });
      sendChauffeurUnassign.mockResolvedValue({ ok: true, providerMessageId: "m5" });
      const c4 = await confirmTripChange(env, claims, first.reference, { ...move, trip: { ...NO, scheduledLocal: "2030-01-02T14:10", driver: "unassign" } }, undefined, deps);
      expect(c4).toMatchObject({ ok: true, outcome: "applied", driverTakenOff: true });
      expect(await leg(first.id)).toMatchObject({ scheduled_local: "2030-01-02T14:10", driver: null });
      expect(await leg(other.id)).toMatchObject({ driver: drivers.c });
      expect(sendChauffeurUnassign.mock.calls.at(-1)![2]).toBe(`p6e-driver-c-${tag}@example.test`);

      // --- PATCH: places refused on a paid trip; contact saved and recorded --------------------------------
      const patched = await seedBooking("patch", ECO, { local: "2030-01-03T10:00", driver: drivers.a });
      const call = (body: unknown) =>
        (PATCH as unknown as (r: Request) => Promise<Response>)(
          new Request(`https://dashboard.vamostaxi.site/api/staff/bookings/${patched.reference}`, { method: "PATCH", body: JSON.stringify(body) }),
        );
      const refused = await call({ phone: "+41 79 111 22 33", pickup: "" });
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ ok: false, code: "use-change" });
      expect((await su<{ phone: string }[]>`select contact_phone as phone from public.bookings where id = ${patched.id}`)[0]!.phone).toBe("+41 79 000 00 06");
      sendFlightNumber.mockResolvedValue({ ok: true, providerMessageId: "m6" });
      const saved = await call({ customer: "", phone: "+41 79 111 22 33", note: "Gate B", flight: "lx 320" });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ ok: true, data: { changed: ["contact_phone", "note", "flight_no"], driverMailed: true } });
      const after = (await su<{ name: string; phone: string; note: string; flight: string; pickup: string; pax: number }[]>`
        select b.contact_name as name, b.contact_phone as phone, b.note, l.flight_no as flight, l.pickup_text as pickup, l.pax
          from public.bookings b join public.booking_legs l on l.booking_id = b.id where b.id = ${patched.id}`)[0]!;
      expect(after).toEqual({ name: "P6E patch", phone: "+41 79 111 22 33", note: "Gate B", flight: "LX 320", pickup: "Zurich Oerlikon", pax: 2 });
      const event = (await su<{ fields: unknown; actor: string }[]>`
        select payload -> 'fields' as fields, actor_kind as actor from public.booking_events
         where booking_id = ${patched.id} and kind = 'booking.modified'`)[0]!;
      expect(event).toEqual({ fields: ["contact_phone", "note", "flight_no"], actor: "staff" });
      expect(sendFlightNumber.mock.calls[0]![2]).toBe(`p6e-driver-a-${tag}@example.test`);
    } finally {
      // The other local suites publish their own live book (one live at a time): leave none live.
      await su`update public.rate_versions set status = 'retired' where slug = ${`p6e-${tag}`} and status = 'live'`.catch(() => undefined);
      await su.end({ timeout: 5 });
    }
  });
});
