// apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts
//
// GET /api/staff/tickets — contact_submissions as Support tickets.
// Dual-mounted at app/api/staff/tickets. Read-only. No fixture rows.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadTickets } from "@/lib/ops/tickets";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadTickets(env, claims);
  return jsonOk(rows);
});
