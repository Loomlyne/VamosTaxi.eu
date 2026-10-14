// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts
//
// GET /api/staff/bookings/:id/stripe-payments — Phase 31 (D-01, D-06, D-14). Admin only.
// The booking's succeeded Stripe payments, newest first, each with kind, chargedRappen,
// leftRappen, capturedAt and the Stripe Dashboard link REFUND opens in a new tab. JSON only:
// the page opens the link itself; this route never sends the browser anywhere and never refunds.
//   200 { ok: true, data: StripePaymentRow[] }
//   404 not-found             unknown, erased or invisible booking key
//   503 stripe-mode-unknown   the Worker's Stripe key names no mode
// Dual-mounted at app/api/staff/bookings/[id]/stripe-payments.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadStripePayments } from "@/lib/ops/stripe-payments";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "stripe-payments") return null;
  return id;
}

export const GET = withAdmin(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const result = await loadStripePayments(env, claims, id);
  if (!result.ok) return jsonErr(result.code, result.code === "not-found" ? 404 : 503);
  return jsonOk(result.rows);
});
