// Staff-only lookup. vamos_system has EXECUTE on ops_* definers and no
// SELECT on public.bookings — looking the row up as the system role is 42501.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

export async function resolveStaffBookingId(
  env: CloudflareEnv,
  claims: VamosClaims,
  key: string,
): Promise<string | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select id
        from public.bookings
       where erased_at is null
         and (id::text = ${trimmed} or reference = ${trimmed})
       limit 1
    `;
    return rows[0]?.id ?? null;
  });
}
