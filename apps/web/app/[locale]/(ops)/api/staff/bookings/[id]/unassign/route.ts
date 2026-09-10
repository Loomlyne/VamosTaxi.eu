// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/unassign/route.ts
//
// POST /api/staff/bookings/:id/unassign — clears both assignment FKs.
// Dual-mounted at app/api/staff/bookings/[id]/unassign.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unassignBooking } from "@/lib/ops/assign";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "assign" || id === "unassign") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "frozen") return 409;
  return 400;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const result = await unassignBooking(env, claims, id);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({ id, bookingId: result.bookingId });
});
