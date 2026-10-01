// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/change/withdraw/route.ts
//
// POST /api/staff/bookings/:id/change/withdraw — 26.2 P1 "Withdraw change" (owner sign-off
// 2026-10-01): ends the admin's dearer class change that waits for the customer's payment. The
// Stripe page for the difference is closed first; nothing is charged; the booking stays as it was.
// Body: {} (nothing else is read). Answers: ok | nothing-waiting | already-paid (she paid in the same
// second: the change applies) | stripe-failed (nothing ended, try again). Staff who can use Edit.
// Dual-mounted at app/api/staff/bookings/[id]/change/withdraw.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { changeFailStatus } from "@/lib/ops/booking-change-map";
import { withdrawBookingChange } from "@/lib/ops/booking-change";
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
    const text = await request.text();
    raw = text.trim() ? JSON.parse(text) : {};
  } catch {
    return jsonErr("invalid-body", 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 0) {
    return jsonErr("invalid-body", 400);
  }
  const { env } = getCloudflareContext();
  const result = await withdrawBookingChange(env, claims, id);
  if (!result.ok) return jsonErr(result.code, changeFailStatus(result.code));
  return jsonOk(result);
});
