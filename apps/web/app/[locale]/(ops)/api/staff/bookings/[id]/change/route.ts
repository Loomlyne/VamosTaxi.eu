// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/change/route.ts
//
// POST /api/staff/bookings/:id/change — 26.2 P1: the admin confirms a class change on a paid trip.
// Body: { klass, expectTotalRappen, expectPaidRappen } — the class slug from the preview and the
// two figures it showed. The server prices again and refuses when either moved; no amount and no
// changed field is ever taken from the browser. Outcomes: applied | refund_due | extra_required.
// Staff who can use Edit. Dual-mounted at app/api/staff/bookings/[id]/change.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { changeFailStatus, parseChangeBody } from "@/lib/ops/booking-change-map";
import { confirmBookingChange } from "@/lib/ops/booking-change";
import { DASHBOARD_ORIGIN } from "@/lib/ops/edit-request";
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
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("invalid-body", 400);
  }
  const parsed = parseChangeBody(raw);
  if (!parsed.ok) return jsonErr(parsed.code, 400);
  const { env } = getCloudflareContext();
  const result = await confirmBookingChange(
    env,
    claims,
    id,
    parsed.value,
    request.headers.get("origin") ?? DASHBOARD_ORIGIN,
  );
  if (!result.ok) return jsonErr(result.code, changeFailStatus(result.code));
  return jsonOk(result);
});
