// apps/web/lib/ops/bookings-write.ts
//
// Staff cancel, refund, delete, and in-place field updates.
// Board `id` is the public reference; bookingId is the uuid — match either.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

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

export async function cancelBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<CancelledBooking | null> {
  const key = id.trim();
  if (!key) return null;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<
      { id: string; reference: string; email: string; name: string; locale: string }[]
    >`
      update public.bookings
      set status = 'cancelled', updated_at = now()
      where erased_at is null
        and (id::text = ${key} or reference = ${key})
      returning
        id,
        reference,
        contact_email::text as email,
        contact_name as name,
        coalesce(locale, 'en') as locale
    `;
    const row = rows[0];
    if (!row) return null;
    const paidRows = await sql<{ paid: boolean }[]>`
      select exists(
        select 1
        from public.booking_payments p
        where p.booking_id = ${row.id}::uuid
          and (p.captured_at is not null or p.status in ('captured', 'paid', 'succeeded'))
      ) as paid
    `;
    return { ...row, paid: Boolean(paidRows[0]?.paid) };
  });
}

export async function markRefunded(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<CancelledBooking | null> {
  const key = id.trim();
  if (!key) return null;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<
      { id: string; reference: string; email: string; name: string; locale: string }[]
    >`
      update public.bookings
      set status = 'refunded', updated_at = now()
      where erased_at is null
        and (id::text = ${key} or reference = ${key})
        and status in ('cancelled', 'refunded')
      returning
        id,
        reference,
        contact_email::text as email,
        contact_name as name,
        coalesce(locale, 'en') as locale
    `;
    const row = rows[0];
    if (!row) return null;
    return { ...row, paid: true };
  });
}

export async function updateBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  patch: BookingPatch,
): Promise<boolean> {
  const key = id.trim();
  if (!key) return false;
  return asStaff(env, claims, async (sql) => {
    const found = await sql<{ id: string }[]>`
      select id from public.bookings
      where erased_at is null and (id::text = ${key} or reference = ${key})
      limit 1
    `;
    const bookingId = found[0]?.id;
    if (!bookingId) return false;

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
    return true;
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
