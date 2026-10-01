// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/change/preview/route.ts
//
// POST /api/staff/bookings/:id/change/preview — 26.2 P1, read-only. What every class of today's
// live price book would cost for this paid trip: paid so far, new total, difference, or why a
// class cannot be chosen. Body: {} (the class list is always whole; P6 adds trip changes here).
// Staff who can use Edit. Dual-mounted at app/api/staff/bookings/[id]/change/preview.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { changeFailStatus, parseChangeBody } from "@/lib/ops/booking-change-map";
import { previewBookingChange } from "@/lib/ops/booking-change";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "change") return null;
  return id;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = parseChangeBody(raw);
  if (!parsed.ok) return jsonErr(parsed.code, 400);
  const { env } = getCloudflareContext();
  const result = await previewBookingChange(env, claims, id);
  if (!result.ok) return jsonErr(result.code, changeFailStatus(result.code));
  return jsonOk(result);
});
