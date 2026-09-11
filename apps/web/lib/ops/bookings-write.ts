// apps/web/lib/ops/bookings-write.ts
//
// Staff cancel, delete, and in-place field updates. Refund is lib/ops/refund.ts
// (Stripe first). Board `id` is the public reference; bookingId is the uuid.
// DATA-08: ops_cancel_booking writes booking_events (booking.status_changed) in the same tx.

import { asStaff, asSystem, type VamosClaims } from "@/lib/db/identity";
import { mapRefundSqlError, sqlErrorCode } from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";
import { OPS_SQLSTATE } from "./sqlstate";

export const dynamic = "force-dynamic";

export type CancelledBooking = {
  id: string;
  reference: string;
  email: string;
  name: string;
  locale: string;
  paid: boolean;
};

export type BookingPatch = {
  customer?: string;
  email?: string;
  phone?: string;
  note?: string;
  pickup?: string;
  dropoff?: string;
  dateIso?: string;
  time?: string;
  pax?: number;
  bags?: number;
  flight?: string;
  klass?: string;
};

function classSlug(label: string): string | null {
  const value = label.trim().toLowerCase();
  if (value === "economy" || value === "business" || value === "first" || value === "van") {
    return value;
  }
  return null;
}

export type CancelResult =
  | { ok: true; booking: CancelledBooking }
  | { ok: false; code: "not-found" | "frozen" | "unknown" };

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<CancelResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = BOOKING_UUID.test(key)
    ? key
    : await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  return asSystem(env, async (sql) => {
    try {
      const rows = await sql<
        {
          booking_id: string;
          reference: string;
          email: string;
          name: string;
          locale: string;
          paid: boolean;
        }[]
      >`
        select * from public.ops_cancel_booking(
          ${bookingId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return {
        ok: true,
        booking: {
          id: String(row.booking_id),
          reference: String(row.reference),
          email: String(row.email ?? ""),
          name: String(row.name ?? ""),
          locale: String(row.locale ?? "en"),
          paid: Boolean(row.paid),
        },
      };
    } catch (err) {
      if (sqlErrorCode(err) === OPS_SQLSTATE.noData) {
        return { ok: false, code: "not-found" };
      }
      const mapped = mapRefundSqlError(err);
      if (mapped.code === "frozen") return { ok: false, code: "frozen" };
      return { ok: false, code: "unknown" };
    }
  });
}

export type UpdateResult =
  | { ok: true }
  | { ok: false; code: "not-found" | "unpaid" };

export async function updateBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  patch: BookingPatch,
): Promise<UpdateResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  return asStaff(env, claims, async (sql) => {
    const found = await sql<{ id: string }[]>`
      select id from public.bookings
      where erased_at is null and (id::text = ${key} or reference = ${key})
      limit 1
    `;
    const bookingId = found[0]?.id;
    if (!bookingId) return { ok: false, code: "not-found" };

    const paid = await sql<{ id: number }[]>`
      select 1 as id
        from public.booking_payments
       where booking_id = ${bookingId}::uuid
         and captured_at is not null
       limit 1
    `;
    if (paid.length === 0) return { ok: false, code: "unpaid" };

    await sql`
      update public.bookings
      set
        contact_name = coalesce(${patch.customer ?? null}, contact_name),
        contact_email = coalesce(${patch.email ?? null}, contact_email),
        contact_phone = coalesce(${patch.phone ?? null}, contact_phone),
        note = coalesce(${patch.note ?? null}, note),
        updated_at = now()
      where id = ${bookingId}::uuid
    `;

    const pickup = patch.pickup ?? null;
    const dropoff = patch.dropoff ?? null;
    const flight = patch.flight ?? null;
    const slug = patch.klass ? classSlug(patch.klass) : null;
    const dateIso = (patch.dateIso ?? "").trim();
    const time = (patch.time ?? "").trim();
    const local = dateIso && time ? `${dateIso}T${time}:00` : null;
    const pax = typeof patch.pax === "number" && Number.isFinite(patch.pax) ? patch.pax : null;
    const bags = typeof patch.bags === "number" && Number.isFinite(patch.bags) ? patch.bags : null;

    await sql`
      update public.booking_legs
      set
        pickup_text = coalesce(${pickup}, pickup_text),
        dropoff_text = coalesce(${dropoff}, dropoff_text),
        flight_no = coalesce(${flight}, flight_no),
        scheduled_local = coalesce(${local}, scheduled_local),
        scheduled_at = case
          when ${local} is null then scheduled_at
          else (${local}::timestamp at time zone 'Europe/Zurich')
        end,
        vehicle_class_id = case
          when ${slug} is null then vehicle_class_id
          else coalesce(
            (select id from public.vehicle_classes where slug = ${slug} limit 1),
            vehicle_class_id
          )
        end
      where booking_id = ${bookingId}::uuid
        and leg_seq = (
          select min(leg_seq) from public.booking_legs where booking_id = ${bookingId}::uuid
        )
    `;
    await sql`
      update public.booking_legs
      set
        pax = coalesce(${pax}, pax),
        bags = coalesce(${bags}, bags)
      where booking_id = ${bookingId}::uuid
        and leg_seq = (
          select min(leg_seq) from public.booking_legs where booking_id = ${bookingId}::uuid
        )
    `;
    return { ok: true };
  });
}

export async function eraseBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<boolean> {
  const key = id.trim();
  if (!key) return false;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update public.bookings
      set erased_at = now(), updated_at = now()
      where erased_at is null
        and (id::text = ${key} or reference = ${key})
      returning id
    `;
    return rows.length > 0;
  });
}
