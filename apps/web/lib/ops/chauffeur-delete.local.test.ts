// apps/web/lib/ops/chauffeur-delete.local.test.ts
//
// Quick 261001-chauffeur-car, owner decision 7 (2026-10-01): deleting a chauffeur keeps his row for
// his finished trips; his trips that are not finished — a future one and one whose pickup passed
// but nobody closed — go back to unassigned; he leaves the Chauffeurs list and Assign. On a real
// local database, through the REAL deleteChauffeurRow (asSystem → ops_delete_chauffeur),
// loadChauffeurs, loadChauffeurHistory (asStaff) and assignBooking, all on postgres.js with the
// Worker's client options. The unused vehicle row is never touched.
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
import { loadChauffeurHistory } from "./chauffeur-history";
import { loadChauffeurs } from "./chauffeurs";
import { deleteChauffeurRow } from "./chauffeurs-write";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];

describe.skipIf(!PORT)("deleteChauffeurRow on a real database (local, committed fixture)", () => {
  it("keeps his finished trip, unassigns the ones not finished, hides him, and refuses him on Assign", async () => {
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
    const futureId = randomUUID();
    const staleId = randomUUID();
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
        for (const [id, hours, status] of [
          [doneId, -24 * 30, "completed"],
          [futureId, 24 * 30, "assigned"],
          [staleId, -2, "assigned"],
        ] as const) {
          await tx`
            insert into public.bookings (id, reference, contact_name, contact_email, status)
            values (${id}::uuid, public.next_booking_reference(), 'Local Trip', ${`${tag}-${id.slice(0, 4)}@example.test`}, 'confirmed')`;
          await tx`set local session_replication_role = replica`;
          await tx`
            insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
              scheduled_at, original_scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes,
              pax, bags, assigned_chauffeur_id, status, turnaround_buffer_minutes)
            values (${id}::uuid, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
              now() + make_interval(hours => ${hours}), now() + make_interval(hours => ${hours}),
              to_char(now() + make_interval(hours => ${hours}), 'YYYY-MM-DD"T"HH24:MI'),
              ${classId}::uuid, 60, 1, 1, ${chauffeurId}::uuid, ${status}::public.booking_status, 15)`;
          await tx`update public.bookings set status = ${status}::public.booking_status where id = ${id}::uuid`;
          await tx`set local session_replication_role = origin`;
        }
      });
      const [carBefore] = await su<{ row: string }[]>`select row_to_json(v)::text as row from public.vehicles v where v.id = ${vehicleId}::uuid`;
      const refs = await su<{ id: string; reference: string }[]>`
        select id::text as id, reference from public.bookings where id in (${futureId}::uuid, ${staleId}::uuid)`;
      const refOf = (id: string) => refs.find((r) => r.id === id)!.reference;
      const claims: VamosClaims = { sub: userId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } };

      expect((await loadChauffeurHistory(env, claims, chauffeurId)).map((h) => h.bookingId)).toEqual([futureId, staleId, doneId]);

      const deleted = await deleteChauffeurRow(env, claims, chauffeurId);
      expect(deleted.kind).toBe("deleted");
      expect(deleted.kind === "deleted" ? [...deleted.unassigned].sort() : []).toEqual([refOf(futureId), refOf(staleId)].sort());

      const legs = await su<{ booking: string; chauffeur: string | null; status: string }[]>`
        select booking_id::text as booking, assigned_chauffeur_id::text as chauffeur, status::text as status
          from public.booking_legs where booking_id in (${doneId}::uuid, ${futureId}::uuid, ${staleId}::uuid)`;
      const leg = (id: string) => legs.find((l) => l.booking === id);
      expect(leg(doneId)).toEqual({ booking: doneId, chauffeur: chauffeurId, status: "completed" });
      expect(leg(futureId)).toEqual({ booking: futureId, chauffeur: null, status: "confirmed" });
      expect(leg(staleId)).toEqual({ booking: staleId, chauffeur: null, status: "confirmed" });
      const [row] = await su<{ full_name: string; gone: boolean; active: boolean }[]>`
        select full_name, deleted_at is not null as gone, active from public.chauffeurs where id = ${chauffeurId}::uuid`;
      expect(row).toEqual({ full_name: "Marco Delete", gone: true, active: false });

      expect((await loadChauffeurs(env, claims)).some((c) => c.id === chauffeurId)).toBe(false);
      await expect(deleteChauffeurRow(env, claims, chauffeurId)).resolves.toEqual({ kind: "gone" });
      await expect(assignBooking(env, claims, futureId, chauffeurId)).resolves.toMatchObject({ ok: false });

      const [carAfter] = await su<{ row: string }[]>`select row_to_json(v)::text as row from public.vehicles v where v.id = ${vehicleId}::uuid`;
      expect(carAfter).toEqual(carBefore);
    } finally {
      await su.end({ timeout: 1 });
    }
  }, 30_000);
});
