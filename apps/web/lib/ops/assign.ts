// apps/web/lib/ops/assign.ts
//
// 08-04: staff assign/unassign via SECURITY DEFINER RPCs. withStaff on the
// route, then asSystem here. Never asStaff INSERT into booking_events.
// 08-09: chauffeur assign/unassign mail after RPC ok. Do not claim
// confirmation mail. Do not send from the browser.

import {
  chauffeurEmailLocale,
  sendChauffeurAssign,
  sendChauffeurUnassign,
  type ChauffeurDispatchForEmail,
} from "@vamos/emails/confirmation";
import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { resolveStaffBookingId } from "./resolve-booking-id";
import {
  mapAssignSqlError,
  type AssignOverlap,
  type AssignResult,
} from "./assign-map";

export const dynamic = "force-dynamic";

export {
  mapAssignSqlError,
  type AssignFail,
  type AssignOk,
  type AssignOverlap,
  type AssignResult,
} from "./assign-map";

type TripMailRow = {
  reference: string;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  email: string | null;
  languages: string[] | null;
};

type ChauffeurTripMail = {
  to: string;
  trip: ChauffeurDispatchForEmail;
};

function languagesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry));
}

function tripMail(row: TripMailRow | undefined): ChauffeurTripMail | null {
  if (!row) return null;
  const to = String(row.email ?? "").trim();
  if (!to) return null;
  return {
    to,
    trip: {
      reference: String(row.reference),
      locale: chauffeurEmailLocale(languagesOf(row.languages)),
      pickupText: String(row.pickup_text ?? ""),
      dropoffText: String(row.dropoff_text ?? ""),
      scheduledLocal: String(row.scheduled_local ?? ""),
    },
  };
}

type OpsSql = Parameters<Parameters<typeof asSystem>[1]>[0];

async function loadChauffeurTrip(
  sql: OpsSql,
  bookingId: string,
  chauffeurId: string,
): Promise<ChauffeurTripMail | null> {
  const rows = await sql<TripMailRow[]>`
    select
      b.reference,
      l.pickup_text,
      l.dropoff_text,
      l.scheduled_local,
      c.email,
      c.languages
      from public.bookings as b
      join public.booking_legs as l on l.booking_id = b.id
      join public.chauffeurs as c on c.id = ${chauffeurId}::uuid
     where b.id = ${bookingId}::uuid
     order by l.leg_seq
     limit 1
  `;
  return tripMail(rows[0]);
}

async function loadAssignedChauffeurTrip(
  sql: OpsSql,
  bookingId: string,
): Promise<ChauffeurTripMail | null> {
  const rows = await sql<TripMailRow[]>`
    select
      b.reference,
      l.pickup_text,
      l.dropoff_text,
      l.scheduled_local,
      c.email,
      c.languages
      from public.bookings as b
      join public.booking_legs as l on l.booking_id = b.id
      join public.chauffeurs as c on c.id = l.assigned_chauffeur_id
     where b.id = ${bookingId}::uuid
     order by l.leg_seq
     limit 1
  `;
  return tripMail(rows[0]);
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

async function notifyChauffeur(
  env: CloudflareEnv,
  kind: "assign" | "unassign",
  mail: ChauffeurTripMail | null,
): Promise<void> {
  if (!mail) return;
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return;
  if (kind === "unassign") {
    await sendChauffeurUnassign({ RESEND_API_KEY: key }, mail.trip, mail.to);
    return;
  }
  await sendChauffeurAssign({ RESEND_API_KEY: key }, mail.trip, mail.to);
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
  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  const result = await asSystem(env, async (sql) => {
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
      if (!row) return { ok: false, code: "unknown" } as const;
      return {
        ok: true as const,
        bookingId: String(row.booking_id),
        legId: String(row.leg_id),
        chauffeurId: String(row.chauffeur_id),
        vehicleId: String(row.vehicle_id),
      };
    } catch (err) {
      return mapAssignSqlError(err);
    }
  });
  if (!result.ok && result.code === "overlap") {
    try {
      const overlap = await asStaff(env, claims, (sql) =>
        loadOverlap(sql, bookingId, chauffeur),
      );
      return { ...result, otherRef: overlap.otherRef, otherLocal: overlap.otherLocal };
    } catch {
      return result;
    }
  }
  if (result.ok && result.chauffeurId) {
    try {
      const assignedId = result.chauffeurId;
      const mail = await asStaff(env, claims, (sql) =>
        loadChauffeurTrip(sql, result.bookingId, assignedId),
      );
      await notifyChauffeur(env, "assign", mail);
    } catch {
      // Assignment already committed. Mail is best-effort.
    }
  }
  return result;
}

export async function unassignBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<AssignResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  let mail: ChauffeurTripMail | null = null;
  try {
    mail = await asStaff(env, claims, (sql) => loadAssignedChauffeurTrip(sql, bookingId));
  } catch {
    mail = null;
  }
  const result = await asSystem(env, async (sql) => {
    try {
      const rows = await sql<{ booking_id: string; leg_id: string }[]>`
        select * from public.ops_unassign_leg(
          ${bookingId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" } as const;
      return {
        ok: true as const,
        bookingId: String(row.booking_id),
        legId: String(row.leg_id),
      };
    } catch (err) {
      return mapAssignSqlError(err);
    }
  });
  if (result.ok) {
    try {
      await notifyChauffeur(env, "unassign", mail);
    } catch {
      // Unassign already committed. Mail is best-effort.
    }
  }
  return result;
}
