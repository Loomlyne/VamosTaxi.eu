// apps/web/lib/ops/assign.ts
//
// 08-04: staff assign/unassign via SECURITY DEFINER RPCs. withStaff on the
// route, then asSystem here. Never asStaff INSERT into booking_events.
// 08-09: chauffeur assign/unassign mail after RPC ok. Do not claim
// confirmation mail. Do not send from the browser.
// 09-07 D-28: sendAssignmentCustomer via notifyAssignmentCustomer after
// ops_assign_leg ok. No extra 24h reminder. Unassign stays chauffeur-only.

import {
  chauffeurEmailLocale,
  sendChauffeurAssign,
  sendChauffeurUnassign,
  type ChauffeurDispatchForEmail,
  type EmailLocale,
} from "@vamos/emails/confirmation";
import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { notifyAssignmentCustomer } from "../lifecycle/notify-lifecycle";
import { resolveStaffBookingId } from "./resolve-booking-id";
import { classDisplayName } from "./class-slug";
import {
  assignClassRefusal,
  mapAssignSqlError,
  type AssignClassFacts,
  type AssignOverlap,
  type AssignResult,
} from "./assign-map";

export const dynamic = "force-dynamic";

export {
  assignClassRefusal,
  mapAssignSqlError,
  type AssignClassFacts,
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

type CustomerAssignRow = {
  reference: string;
  locale: string | null;
  contact_email: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  chauffeur_name: string | null;
  vehicle: string | null;
  plate: string | null;
};

function asEmailLocale(locale: string): EmailLocale {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

async function loadCustomerAssignment(
  sql: OpsSql,
  bookingId: string,
  chauffeurId: string,
): Promise<CustomerAssignRow | null> {
  const rows = await sql<CustomerAssignRow[]>`
    select
      b.reference,
      b.locale,
      b.contact_email::text as contact_email,
      l.pickup_text,
      l.dropoff_text,
      l.scheduled_local,
      c.full_name as chauffeur_name,
      null::text as vehicle,
      c.plate as plate
      from public.bookings as b
      join public.booking_legs as l on l.booking_id = b.id
      join public.chauffeurs as c on c.id = ${chauffeurId}::uuid
     where b.id = ${bookingId}::uuid
     order by l.leg_seq
     limit 1
  `;
  return rows[0] ?? null;
}

async function notifyCustomerAssignment(
  env: CloudflareEnv,
  bookingId: string,
  row: CustomerAssignRow | null,
): Promise<void> {
  const customerEmail = String(row?.contact_email ?? "").trim();
  if (!row || !customerEmail) return;
  await notifyAssignmentCustomer(env, {
    bookingId,
    customerEmail,
    reference: String(row.reference),
    locale: asEmailLocale(String(row.locale ?? "en")),
    pickupText: String(row.pickup_text ?? ""),
    dropoffText: String(row.dropoff_text ?? ""),
    scheduledLocal: String(row.scheduled_local ?? ""),
    chauffeurName: row.chauffeur_name,
    vehicle: row.vehicle,
    plate: row.plate,
  });
}

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
  sql: OpsSql,
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
       and other.assigned_chauffeur_id = c.id
      join public.bookings as b on b.id = other.booking_id
     where mine.booking_id = ${bookingId}::uuid
     order by other.scheduled_at
     limit 1
  `;
  const row = rows[0];
  if (!row) return { otherRef: "", otherLocal: "" };
  return { otherRef: String(row.reference), otherLocal: String(row.scheduled_local) };
}

type ClassFactsRow = {
  driver_name: string | null;
  driver_class_id: string | null;
  driver_class_name: string | null;
  driver_class_slug: string | null;
  trip_class_id: string | null;
  trip_class_name: string | null;
  trip_class_slug: string | null;
};

/** A class as the owner names it: his typed name, else the D-14 name of the slug, else the slug. */
function className(name: string | null, slug: string | null): string {
  const typed = String(name ?? "").trim();
  if (typed) return typed;
  const raw = String(slug ?? "").trim();
  if (!raw) return "";
  return classDisplayName(raw) ?? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, " ");
}

/**
 * No cars (owner, 2026-10-01): the driver's class (chauffeurs.vehicle_class_id) and the class of
 * the trip's first leg (the leg the RPC assigns). Null when the booking or the driver is not
 * there — the RPC then answers not-found.
 */
export async function loadAssignClassFacts(
  sql: OpsSql,
  bookingId: string,
  chauffeurId: string,
): Promise<AssignClassFacts | null> {
  const rows = await sql<ClassFactsRow[]>`
    select
      c.full_name as driver_name,
      c.vehicle_class_id as driver_class_id,
      driver_cls.name as driver_class_name,
      driver_cls.slug as driver_class_slug,
      l.vehicle_class_id as trip_class_id,
      trip_cls.name as trip_class_name,
      trip_cls.slug as trip_class_slug
      from public.bookings as b
      join public.booking_legs as l on l.booking_id = b.id
      join public.chauffeurs as c on c.id = ${chauffeurId}::uuid
      left join public.vehicle_classes as driver_cls on driver_cls.id = c.vehicle_class_id
      left join public.vehicle_classes as trip_cls on trip_cls.id = l.vehicle_class_id
     where b.id = ${bookingId}::uuid
     order by l.leg_seq
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    driverName: String(row.driver_name ?? "").trim(),
    driverClassId: row.driver_class_id ? String(row.driver_class_id) : null,
    driverClassName: className(row.driver_class_name, row.driver_class_slug),
    tripClassId: row.trip_class_id ? String(row.trip_class_id) : null,
    tripClassName: className(row.trip_class_name, row.trip_class_slug),
  };
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
  // Owner, 2026-10-01 (no cars): a driver without a class, or of another class than the trip's, is
  // refused before the database call, so nothing is written. A read that fails answers a refusal,
  // not a 500. ops_assign_leg checks the same rule again (20261007160000).
  let facts: AssignClassFacts | null;
  try {
    facts = await asStaff(env, claims, (sql) => loadAssignClassFacts(sql, bookingId, chauffeur));
  } catch {
    return { ok: false, code: "unknown" };
  }
  const refusal = assignClassRefusal(facts);
  if (refusal) return refusal;
  // 260930-dash-assign: map the refusal AROUND asSystem, never inside it. postgres.js begin()
  // rethrows a query error the callback caught, and the deferred GiST overlap (23P01) only fails
  // at COMMIT — a catch inside the callback let both escape as a 500 (generic "Could not assign").
  let result: AssignResult;
  try {
    result = await asSystem<AssignResult>(env, async (sql) => {
      const rows = await sql<
        { booking_id: string; leg_id: string; chauffeur_id: string; vehicle_id: string | null }[]
      >`
        select * from public.ops_assign_leg(
          ${bookingId}::uuid,
          ${chauffeur}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      // No cars (2026-10-01): the RPC answers vehicle_id null; no vehicle id leaves this function.
      return {
        ok: true,
        bookingId: String(row.booking_id),
        legId: String(row.leg_id),
        chauffeurId: String(row.chauffeur_id),
      };
    });
  } catch (err) {
    result = mapAssignSqlError(err);
  }
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
      const loaded = await asStaff(env, claims, async (sql) => {
        const mail = await loadChauffeurTrip(sql, result.bookingId, assignedId);
        const customer = await loadCustomerAssignment(sql, result.bookingId, assignedId);
        return { mail, customer };
      });
      await notifyChauffeur(env, "assign", loaded.mail);
      await notifyCustomerAssignment(env, result.bookingId, loaded.customer);
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
  // Same rule as assignBooking: the refusal is mapped around asSystem.
  let result: AssignResult;
  try {
    result = await asSystem<AssignResult>(env, async (sql) => {
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
    });
  } catch (err) {
    result = mapAssignSqlError(err);
  }
  if (result.ok) {
    try {
      await notifyChauffeur(env, "unassign", mail);
    } catch {
      // Unassign already committed. Mail is best-effort.
    }
  }
  return result;
}
