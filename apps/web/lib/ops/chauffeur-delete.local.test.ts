// apps/web/lib/ops/chauffeur-delete.local.test.ts
//
// Quick 261001-chauffeur-car (owner, 2026-10-01: "anything deleted should be deleted completely").
// On a real local database, through the REAL deleteChauffeurRow and loadChauffeurHistory (asStaff on
// postgres.js with the Worker's client options): a chauffeur with one finished trip and one paid
// trip still open is refused with his name and the open reference, and nothing changes; his history
// lists both, newest first. Once the open trip is closed, the delete goes through: both legs keep
// their record without him, the chauffeur row is gone, and the unused vehicle row is untouched.
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
import { loadChauffeurHistory } from "./chauffeur-history";
import { deleteChauffeurRow } from "./chauffeurs-write";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

describe.skipIf(!PORT)("deleteChauffeurRow on a real database (local, committed fixture)", () => {
  it("refuses while a trip is open, lists his history, then deletes him completely", async () => {
    const env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    } as unknown as CloudflareEnv;
    const su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const tag = `cdl${Math.random().toString(36).slice(2, 8)}`;
    const classId = randomUUID();
    const vehicleId = randomUUID();
    const chauffeurId = randomUUID();
    const userId = randomUUID();
    const doneId = randomUUID();
    const openId = randomUUID();
    try {
      await su.begin(async (tx) => {
        await tx`
          insert into public.vehicle_classes (id, slug, name, passenger_capacity, luggage_capacity)
          values (${classId}::uuid, ${tag}, 'Business', 3, 3)`;
        await tx`
          insert into public.vehicles (id, vehicle_class_id, model, plate, seats, bags, status)
          values (${vehicleId}::uuid, ${classId}::uuid, 'Unused car', ${`ZH-${tag}`}, 3, 3, 'service')`;
        await tx`
          insert into public.chauffeurs (id, full_name, phone, email, licence_number, vehicle_class_id, plate)
          values (${chauffeurId}::uuid, 'Marco Delete', '+41 79 000 00 05', ${`${tag}@example.test`},
                  ${`LIC-${tag}`}, ${classId}::uuid, ${`ZH ${tag}`})`;
        await tx`
          insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
          values (${userId}::uuid, ${`${tag}-owner@example.test`}, 'authenticated', 'authenticated', '{}', '{}', now(), now())`;
        await tx`
          insert into public.staff (user_id, role, active, full_name, accepted_at)
          values (${userId}::uuid, 'admin', true, 'Local Owner', now())`;
        for (const [id, days, status] of [
          [doneId, -30, "completed"],
          [openId, 30, "assigned"],
        ] as const) {
          await tx`
            insert into public.bookings (id, reference, contact_name, contact_email, status)
            values (${id}::uuid, public.next_booking_reference(), 'Local Trip', ${`${tag}-${status}@example.test`}, 'confirmed')`;
          await tx`set local session_replication_role = replica`;
          await tx`
            insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
              scheduled_at, original_scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes,
              pax, bags, assigned_chauffeur_id, status, turnaround_buffer_minutes)
            values (${id}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
              now() + make_interval(days => ${days}), now() + make_interval(days => ${days}),
              to_char(now() + make_interval(days => ${days}), 'YYYY-MM-DD"T"HH24:MI'),
              ${classId}::uuid, 60, 1, 1, ${chauffeurId}::uuid, ${status}::public.booking_status, 15)`;
          await tx`update public.bookings set status = ${status}::public.booking_status where id = ${id}::uuid`;
          await tx`set local session_replication_role = origin`;
        }
      });
      const [carBefore] = await su<{ row: string }[]>`select row_to_json(v)::text as row from public.vehicles v where v.id = ${vehicleId}::uuid`;
      const [openRef] = await su<{ reference: string }[]>`select reference from public.bookings where id = ${openId}::uuid`;
      const claims: VamosClaims = { sub: userId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } };

      const history = await loadChauffeurHistory(env, claims, chauffeurId);
      expect(history.map((h) => h.bookingId)).toEqual([openId, doneId]);
      expect(history.every((h) => h.takenOff === false)).toBe(true);

      const refused = await deleteChauffeurRow(env, claims, chauffeurId);
      expect(refused).toEqual({ kind: "in-use", name: "Marco Delete", references: [openRef!.reference] });
      const [still] = await su<{ n: number }[]>`select count(*)::int as n from public.chauffeurs where id = ${chauffeurId}::uuid`;
      expect(still!.n).toBe(1);

      await su`update public.booking_legs set status = 'completed' where booking_id = ${openId}::uuid`;
      await su`update public.bookings set status = 'completed' where id = ${openId}::uuid`;

      const deleted = await deleteChauffeurRow(env, claims, chauffeurId);
      expect(deleted).toEqual({ kind: "deleted", clearedLegs: 2 });
      const [gone] = await su<{ n: number }[]>`select count(*)::int as n from public.chauffeurs where id = ${chauffeurId}::uuid`;
      expect(gone!.n).toBe(0);
      const legs = await su<{ booking: string; chauffeur: string | null; status: string }[]>`
        select booking_id::text as booking, assigned_chauffeur_id::text as chauffeur, status::text as status
          from public.booking_legs where booking_id in (${doneId}::uuid, ${openId}::uuid) order by scheduled_at`;
      expect(legs).toEqual([
        { booking: doneId, chauffeur: null, status: "completed" },
        { booking: openId, chauffeur: null, status: "completed" },
      ]);
      const [carAfter] = await su<{ row: string }[]>`select row_to_json(v)::text as row from public.vehicles v where v.id = ${vehicleId}::uuid`;
      expect(carAfter).toEqual(carBefore);
    } finally {
      await su.end({ timeout: 1 });
    }
  }, 30_000);
});
