// apps/web/lib/ops/trip-change.local-fixture.ts
//
// 26.2 P6: the world the two local end-to-end files share (trip-change.local.test.ts,
// trip-change-patch.local.test.ts): a live price book with two classes, an admin, three drivers,
// bookings seeded the way checkout writes them, the real trip facts step with Mapbox replaced.
// Two files, not one: every Worker-client call opens its own connection (one per request on a
// Worker) and a single long run used up the local stack's 100 connection slots.
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { expect, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

export async function openWorld(PORT: string, tag: string, adminId: string, claims: VamosClaims) {
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

  const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
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

  const close = async () => {
    // The other local suites publish their own live book (one live at a time): leave none live.
    await su`update public.rate_versions set status = 'retired' where slug = ${`p6e-${tag}`} and status = 'live'`.catch(() => undefined);
    await su.end({ timeout: 5 });
  };
  return { su, env, kv, claims, ECO, BIZ, drivers, deps, retrieve, charged, seedBooking, leg, zug, NO, previewTripChange, confirmTripChange, afterExtraSettled, asSystem, close };
}
