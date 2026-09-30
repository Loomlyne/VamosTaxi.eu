// apps/web/app/[locale]/(ops)/api/staff/customers/[id]/route.ts
//
// GET /api/staff/customers/:id — one customer + booking history.
// PATCH /api/staff/customers/:id — upsert the details.
// DELETE /api/staff/customers/:id — tombstone. Dual-mounted at
// app/api/staff/customers/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  eraseCustomer,
  loadCustomerHistory,
  parseCustomerWrite,
  upsertCustomer,
} from "@/lib/ops/customers";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { toOpsCustomer } from "../ops-customer";

export const dynamic = "force-dynamic";

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
    try {
      const row = await upsertCustomer(env, claims, id, parsed);
      if (!row) return jsonErr("not-found", 404);
      return jsonOk(toOpsCustomer(row));
    } catch (err) {
      const rec = err && typeof err === "object" ? (err as { code?: string; message?: string }) : null;
      const sql = rec && rec.code ? String(rec.code) : "";
      if (sql === "23505") return jsonErr("23505", 409, { message: "That email is already on file." });
      if (sql === "23514") return jsonErr("23514", 400, { message: "One of the fields is not a valid value." });
      return jsonErr("error", 500, { message: "Customer details could not be saved." });
    }
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
    try {
      const erased = await eraseCustomer(env, claims, id);
      if (!erased) return jsonErr("not-found", 404);
      return jsonOk({ id });
    } catch {
      return jsonErr("error", 500, { message: "This customer could not be removed." });
    }
  })(request);
}
