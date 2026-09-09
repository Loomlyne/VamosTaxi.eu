// apps/web/app/[locale]/(ops)/api/staff/customers/route.ts
//
// GET /api/staff/customers — staff list. Dual-mounted at
// app/api/staff/customers. `name` / `trips` aliases exist so
// OpsCustomers.dc.html + cleanCustomer can hydrate.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCustomers, type CustomerRow } from "@/lib/ops/customers";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

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

export const GET = withStaff(async (claims, request) => {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? undefined;
  const rows = await loadCustomers(env, claims, search);
  return jsonOk(rows.map(toOpsCustomer));
});
