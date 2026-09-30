// apps/web/app/[locale]/(ops)/api/staff/customers/route.ts
//
// GET /api/staff/customers — staff list. Dual-mounted at
// app/api/staff/customers. `name` / `trips` aliases exist so
// OpsCustomers.dc.html + cleanCustomer can hydrate.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadCustomers } from "@/lib/ops/customers";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";
import { toOpsCustomer } from "./ops-customer";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims, request) => {
  const { env } = getCloudflareContext();
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? undefined;
  const rows = await loadCustomers(env, claims, search);
  return jsonOk(rows.map(toOpsCustomer));
});
