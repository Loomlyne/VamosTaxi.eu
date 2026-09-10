// apps/web/lib/ops/assign.ts
//
// 08-04: staff assign/unassign via SECURITY DEFINER RPCs. withStaff on the
// route, then asSystem here. Never asStaff INSERT into booking_events.

import { asSystem, type VamosClaims } from "@/lib/db/identity";
import { OPS_SQLSTATE } from "./sqlstate";

export const dynamic = "force-dynamic";

export type AssignOverlap = { otherRef: string; otherLocal: string };

export type AssignFail = {
  ok: false;
  code: string;
  otherRef?: string;
  otherLocal?: string;
};

export type AssignOk = {
  ok: true;
  bookingId: string;
  legId: string;
  chauffeurId?: string;
  vehicleId?: string;
};

export type AssignResult = AssignOk | AssignFail;

const NAMED = new Set(["no-email", "no-vehicle", "not-paid", "frozen", "capacity", "not-found"]);

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  if (!("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function mapAssignSqlError(err: unknown, overlap?: AssignOverlap | null): AssignFail {
  const code = codeOf(err);
  if (code === OPS_SQLSTATE.exclusion) {
    return {
      ok: false,
      code: "overlap",
      otherRef: overlap?.otherRef ?? "",
      otherLocal: overlap?.otherLocal ?? "",
    };
  }
  const message = messageOf(err);
  for (const name of NAMED) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (code === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  return { ok: false, code: "unknown" };
}

async function resolveBookingId(
  sql: Parameters<Parameters<typeof asSystem>[1]>[0],
  key: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id
      from public.bookings
     where erased_at is null
       and (id::text = ${key} or reference = ${key})
     limit 1
  `;
  return rows[0]?.id ?? null;
}

async function loadOverlap(
  sql: Parameters<Parameters<typeof asSystem>[1]>[0],
  bookingId: string,
  chauffeurId: string,
): Promise<AssignOverlap> {
  const rows = await sql<{ reference: string; scheduled_local: string }[]>`
    select b.reference, other.scheduled_local
      from public.booking_legs as mine
      join public.chauffeurs as c on c.id = ${chauffeurId}::uuid
      join public.booking_legs as other
        on other.id <> mine.id
       and other.status not in ('cancelled', 'no_show')
       and other.scheduled_range && mine.scheduled_range
       and (
         other.assigned_chauffeur_id = c.id
         or (
           c.default_vehicle_id is not null
           and other.assigned_vehicle_id = c.default_vehicle_id
         )
       )
      join public.bookings as b on b.id = other.booking_id
     where mine.booking_id = ${bookingId}::uuid
     order by other.scheduled_at
     limit 1
  `;
  const row = rows[0];
  if (!row) return { otherRef: "", otherLocal: "" };
  return { otherRef: String(row.reference), otherLocal: String(row.scheduled_local) };
}

export async function assignBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  chauffeurId: string,
): Promise<AssignResult> {
  const key = bookingKey.trim();
  const chauffeur = chauffeurId.trim();
  if (!key || !chauffeur) return { ok: false, code: "not-found" };
  return asSystem(env, async (sql) => {
    const bookingId = await resolveBookingId(sql, key);
    if (!bookingId) return { ok: false, code: "not-found" };
    try {
      const rows = await sql<
        { booking_id: string; leg_id: string; chauffeur_id: string; vehicle_id: string }[]
      >`
        select * from public.ops_assign_leg(
          ${bookingId}::uuid,
          ${chauffeur}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return {
        ok: true,
        bookingId: String(row.booking_id),
        legId: String(row.leg_id),
        chauffeurId: String(row.chauffeur_id),
        vehicleId: String(row.vehicle_id),
      };
    } catch (err) {
      if (codeOf(err) === OPS_SQLSTATE.exclusion) {
        return mapAssignSqlError(err, await loadOverlap(sql, bookingId, chauffeur));
      }
      return mapAssignSqlError(err);
    }
  });
}

export async function unassignBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<AssignResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  return asSystem(env, async (sql) => {
    const bookingId = await resolveBookingId(sql, key);
    if (!bookingId) return { ok: false, code: "not-found" };
    try {
      const rows = await sql<{ booking_id: string; leg_id: string }[]>`
        select * from public.ops_unassign_leg(
          ${bookingId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return {
        ok: true,
        bookingId: String(row.booking_id),
        legId: String(row.leg_id),
      };
    } catch (err) {
      return mapAssignSqlError(err);
    }
  });
}
