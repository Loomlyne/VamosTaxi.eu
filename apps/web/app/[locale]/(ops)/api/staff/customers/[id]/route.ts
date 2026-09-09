// apps/web/app/[locale]/(ops)/api/staff/customers/[id]/route.ts
//
// GET /api/staff/customers/:id — one customer + booking history.
// DELETE /api/staff/customers/:id — tombstone. Dual-mounted at
// app/api/staff/customers/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  eraseCustomer,
  loadCustomerHistory,
  parseCustomerWrite,
  upsertCustomer,
  type CustomerRow,
} from "@/lib/ops/customers";
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!id) return jsonErr("not-found", 404);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonErr("invalid", 400);
    }
    const parsed = parseCustomerWrite(body);
    if (!parsed) return jsonErr("invalid", 400);
    const { env } = getCloudflareContext();
    const row = await upsertCustomer(env, claims, id, parsed);
    if (!row) return jsonErr("not-found", 404);
    return jsonOk(toOpsCustomer(row));
  })(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!id) return jsonErr("not-found", 404);
    const { env } = getCloudflareContext();
    const erased = await eraseCustomer(env, claims, id);
    if (!erased) return jsonErr("not-found", 404);
    return jsonOk({ id });
  })(request);
}
