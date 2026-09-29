// apps/web/lib/checkout/booking-owned.ts
//
// T-26.3-10-03: does this browser's vt_manage cookie own that booking? Runs as
// the guest role, so the bookings RLS policy (manage-token hash) is the judge:
// a hash that does not own the row sees nothing. Used by the intent's supersede
// path before it may replace an unpaid booking.

import { asGuest } from "../db/identity";
import { hashManageToken, rawManageTokenFromRequest } from "./manage-token";

export async function bookingOwnedByRequest(
  env: CloudflareEnv,
  request: Request,
  bookingId: string,
): Promise<boolean> {
  const hashHex = await hashManageToken(rawManageTokenFromRequest(request));
  if (!hashHex) return false;
  const rows = await asGuest(env, hashHex, (sql) => sql<{ id: string }[]>`
    select id from public.bookings where id = ${bookingId}::uuid
  `);
  return rows.length > 0;
}
