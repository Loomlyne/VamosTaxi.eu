// apps/web/app/[locale]/(ops)/api/staff/customers/[id]/route.ts
//
// GET /api/staff/customers/:id — one customer + booking history (OPS-07).
// Dual-mounted at app/api/staff/customers/[id]. History is display-only:
// no assign / refund / confirm fields and no PATCH (D-26, Phase 8).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCustomerHistory, type CustomerRow } from "@/lib/ops/customers";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function toOpsCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.fullName,
    fullName: row.fullName,
    type: row.type,
    since: row.since,
    trips: row.tripCount,
    tripCount: row.tripCount,
    redacted: row.redacted,
    ...(row.email !== undefined ? { email: row.email } : {}),
    ...(row.phone !== undefined ? { phone: row.phone } : {}),
    ...(row.company !== undefined ? { company: row.company } : {}),
    ...(row.note !== undefined ? { note: row.note } : {}),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!id) return jsonErr("not-found", 404);
    const { env } = getCloudflareContext();
    const history = await loadCustomerHistory(env, claims, id);
    if (!history) return jsonErr("not-found", 404);
    return jsonOk({
      customer: toOpsCustomer(history.customer),
      bookings: history.bookings,
    });
  })(request);
}
