// apps/web/lib/ops/bookings-write.ts
//
// Staff cancel (status) and delete (erased_at). Board `id` is the public
// reference; bookingId is the uuid — match either.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

export async function cancelBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<boolean> {
  const key = id.trim();
  if (!key) return false;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update public.bookings
      set status = 'cancelled', updated_at = now()
      where erased_at is null
        and (id::text = ${key} or reference = ${key})
      returning id
    `;
    return rows.length > 0;
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
