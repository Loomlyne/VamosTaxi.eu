// apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts
//
// GET /api/staff/bookings — every booking, including unpaid quotes.
// Dual-mounted at app/api/staff/bookings. Read-only.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadBookings } from "@/lib/ops/bookings";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadBookings(env, claims);
  return jsonOk(rows);
});
