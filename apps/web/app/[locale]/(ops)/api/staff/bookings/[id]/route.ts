// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
//
// PATCH /api/staff/bookings/:id — cancel ({ status: "cancelled" }).
// DELETE /api/staff/bookings/:id — tombstone (erased_at). Dual-mounted at
// app/api/staff/bookings/[id]. :id is the board id (reference) or uuid.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cancelBooking, eraseBooking } from "@/lib/ops/bookings-write";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonErr("bookings-error", 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonErr("bookings-error", 400);
    }
    const status = (raw as { status?: unknown }).status;
    if (status !== "cancelled") return jsonErr("bookings-error", 400);
    const { env } = getCloudflareContext();
    const ok = await cancelBooking(env, claims, id);
    if (!ok) return jsonErr("not-found", 404);
    return jsonOk({ id, status: "cancelled" });
  })(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    const { env } = getCloudflareContext();
    const ok = await eraseBooking(env, claims, id);
    if (!ok) return jsonErr("not-found", 404);
    return jsonOk({ id });
  })(request);
}
