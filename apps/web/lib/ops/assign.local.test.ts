// apps/web/lib/ops/assign.local.test.ts
//
// Quick 260930-dash-assign. The owner's live shape (2026-09-30) on a real local database, through
// the REAL assignBooking: asStaff resolves the booking, asSystem runs ops_assign_leg, both on
// postgres.js with the Worker's client options. One chauffeur without a default vehicle, one
// vehicle of another class that nobody drives, one paid booking. ops_assign_leg raises
// 'no-vehicle'; the dashboard must get that code back, not a thrown error (a 500, which the page
// shows as the generic "Could not assign"). Then the chauffeur is put on the vehicle the way
// persistVehicleSeats (chauffeur-desk.ts) writes a Morning seat, and the same call assigns. A
// second paid trip at the same time for the same chauffeur then fails at COMMIT (the GiST
// constraints are deferred) and must come back as overlap with the first trip.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack: the fixture is COMMITTED
// (unique per run). Host is fixed to 127.0.0.1.
import { randomUUID } from "node:crypto";
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import type { VamosClaims } from "../db/identity";
import { assignBooking } from "./assign";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

describe.skipIf(!PORT)("assignBooking on the owner's live shape (local, committed fixture)", () => {
  it("answers no-vehicle while the chauffeur has no vehicle, assigns once a vehicle is linked, answers overlap on a clash", async () => {
    const env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    } as unknown as CloudflareEnv;
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const tag = `dsa${Math.random().toString(36).slice(2, 8)}`;
    const classA = randomUUID();
    const classB = randomUUID();
    const vehicleId = randomUUID();
    const chauffeurId = randomUUID();
    const userId = randomUUID();
    const bookingId = randomUUID();
    const otherBookingId = randomUUID();
    try {
      await su.begin(async (tx) => {
        await tx`
          insert into public.vehicle_classes (id, slug, passenger_capacity, luggage_capacity)
          values (${classA}::uuid, ${`${tag}-a`}, 3, 3), (${classB}::uuid, ${`${tag}-b`}, 3, 3)`;
        // The only vehicle: another class than the chauffeur's, in service, no chauffeur seat.
        await tx`
          insert into public.vehicles (id, vehicle_class_id, model, plate, seats, bags, status)
          values (${vehicleId}::uuid, ${classB}::uuid, 'Local car', ${`ZH-${tag}`}, 3, 3, 'service')`;
        // The only chauffeur: active, off, no default vehicle, no login.
        await tx`
          insert into public.chauffeurs (id, full_name, phone, email, licence_number, default_vehicle_id,
                                         vehicle_class_id, languages, status, active, user_id)
          values (${chauffeurId}::uuid, 'Local Driver', '+41 79 000 00 04', ${`${tag}@example.test`},
                  ${`LIC-${tag}`}, null, ${classA}::uuid, '{ar,en,fr}', 'off', true, null)`;
        await tx`
          insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
          values (${userId}::uuid, ${`${tag}-owner@example.test`}, 'authenticated', 'authenticated', '{}', '{}', now(), now())`;
        await tx`
          insert into public.staff (user_id, role, active, full_name, accepted_at)
          values (${userId}::uuid, 'admin', true, 'Local Owner', now())`;
        // Two paid bookings at the same pickup time (one transaction, so the same now()).
        for (const [n, id] of [bookingId, otherBookingId].entries()) {
          await tx`
            insert into public.bookings (id, reference, contact_name, contact_email, status)
            values (${id}::uuid, public.next_booking_reference(), 'Local Paid', ${`${tag}-paid${n}@example.test`}, 'paid')`;
          await tx`
            insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
              scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags)
            values (${id}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
              now() + interval '400 days', to_char(now() + interval '400 days', 'YYYY-MM-DD"T"HH24:MI'),
              ${classA}::uuid, 60, 1, 1)`;
          await tx`set local session_replication_role = replica`;
          const [snap] = await tx<{ id: string }[]>`
            insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
              settings_version_id, engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
              discount_rappen, total_rappen, expires_at, quote_lock_expires_at)
            select gen_random_uuid(), ${classA}::uuid, rv.id, false, sv.id, 'quote-engine@dash-assign', 1, 1, '[]'::jsonb,
              jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                'airport_waiting_minutes', 60, 'city_waiting_minutes', 15, 'settings_version_id', sv.id,
                'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'dash-assign'),
              1, 0, 0, 1, now() + interval '1 day', now() + interval '1 day'
              from (select id from public.rate_versions order by id limit 1) rv,
                   (select id from public.settings_versions order by id limit 1) sv
            returning id::text as id`;
          await tx`
            insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
            values (${id}::uuid, ${snap!.id}::bigint, ${`pi_${tag}_${n}`}, 1, 'succeeded', now())`;
          await tx`set local session_replication_role = origin`;
        }
      });

      const claims: VamosClaims = {
        sub: userId,
        role: "authenticated",
        aal: "aal1",
        app_metadata: { vamos_role: "admin" },
      };

      // The owner's click: the page sends the booking uuid and the only chauffeur's id.
      const first = await assignBooking(env, claims, bookingId, chauffeurId);
      expect(first).toEqual({ ok: false, code: "no-vehicle" });

      // Fleet → vehicle → Morning chauffeur (chauffeur-desk.ts persistVehicleSeats writes both).
      await su`insert into public.vehicle_seats (vehicle_id, seat, chauffeur_id) values (${vehicleId}::uuid, 'morning', ${chauffeurId}::uuid)`;
      await su`update public.chauffeurs set default_vehicle_id = ${vehicleId}::uuid where id = ${chauffeurId}::uuid`;

      const second = await assignBooking(env, claims, bookingId, chauffeurId);
      expect(second).toMatchObject({ ok: true, bookingId, chauffeurId, vehicleId });
      const [leg] = await su<{ chauffeur: string; vehicle: string; status: string }[]>`
        select assigned_chauffeur_id::text as chauffeur, assigned_vehicle_id::text as vehicle, status::text as status
          from public.booking_legs where booking_id = ${bookingId}::uuid`;
      expect(leg).toEqual({ chauffeur: chauffeurId, vehicle: vehicleId, status: "assigned" });

      // Same chauffeur, same pickup time: the deferred GiST constraint fails at COMMIT (23P01).
      const [firstTrip] = await su<{ reference: string; scheduled_local: string }[]>`
        select b.reference, l.scheduled_local from public.bookings b
          join public.booking_legs l on l.booking_id = b.id where b.id = ${bookingId}::uuid`;
      const clash = await assignBooking(env, claims, otherBookingId, chauffeurId);
      expect(clash).toEqual({
        ok: false,
        code: "overlap",
        otherRef: firstTrip!.reference,
        otherLocal: firstTrip!.scheduled_local,
      });
    } finally {
      await su.end({ timeout: 1 });
    }
  }, 30_000);
});
